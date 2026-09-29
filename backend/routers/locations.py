# Location endpoints

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models import Location, Queue, QueueEntry, Restaurant
from schemas import LocationCreate, QueueStatusUpdate
from routers.restaurants import get_current_restaurant


router = APIRouter(prefix="/locations", tags=["Locations"])


@router.post("/")
def create_location(location: LocationCreate, restaurant: Restaurant = Depends(get_current_restaurant), db: Session = Depends(get_db)):
    location_count = db.query(Location).filter(Location.restaurant_id == restaurant.id).count()

    if location_count >= 3:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Free plan allows a maximum of 3 locations")

    new_location = Location(restaurant_id=restaurant.id, name=location.name, address=location.address, city=location.city)

    db.add(new_location)
    db.commit()
    db.refresh(new_location)

    return new_location


@router.patch("/{location_id}/status")
def update_location_status(location_id: int, update: QueueStatusUpdate, restaurant: Restaurant = Depends(get_current_restaurant), db: Session = Depends(get_db)):
    if update.status not in {"open", "paused"}:
        raise HTTPException(status_code=400, detail="Location status must be open or paused")
    location = db.query(Location).filter(Location.id == location_id, Location.restaurant_id == restaurant.id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    location.status = update.status
    db.commit()
    db.refresh(location)
    return location


@router.get("/dashboard")
def get_dashboard_locations(restaurant: Restaurant = Depends(get_current_restaurant), db: Session = Depends(get_db)):
    locations = db.query(Location).filter(Location.restaurant_id == restaurant.id).order_by(Location.id).all()
    result = []
    for location in locations:
        queues = db.query(Queue).filter(Queue.location_id == location.id).order_by(Queue.id).all()
        queue_data = []
        for queue in queues:
            entries_count = db.query(QueueEntry).filter(
                QueueEntry.queue_id == queue.id,
                QueueEntry.status.in_(["waiting", "called", "serving"]),
            ).count()
            queue_data.append({
                "id": queue.id,
                "location_id": queue.location_id,
                "name": queue.name,
                "status": queue.status,
                "created_at": queue.created_at,
                "entriesCount": entries_count,
            })
        result.append({
            "id": location.id,
            "restaurant_id": location.restaurant_id,
            "name": location.name,
            "address": location.address,
            "city": location.city,
            "status": location.status,
            "created_at": location.created_at,
            "queues": queue_data,
        })
    return result


@router.get("/")
def get_locations(restaurant: Restaurant = Depends(get_current_restaurant), db: Session = Depends(get_db)):
    return db.query(Location).filter(Location.restaurant_id == restaurant.id).all()

@router.delete("/{location_id}")
def delete_location(location_id: int, restaurant: Restaurant = Depends(get_current_restaurant), db: Session = Depends(get_db)):
    location = db.query(Location).filter(
        Location.id == location_id,
        Location.restaurant_id == restaurant.id,
    ).first()

    if not location:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")

    queues = db.query(Queue).filter(Queue.location_id == location.id).all()
    queue_ids = [queue.id for queue in queues]
    if queue_ids:
        db.query(QueueEntry).filter(QueueEntry.queue_id.in_(queue_ids)).delete(synchronize_session=False)
        db.query(Queue).filter(Queue.id.in_(queue_ids)).delete(synchronize_session=False)

    db.delete(location)
    db.commit()

    return {"message": "Location deleted"}
