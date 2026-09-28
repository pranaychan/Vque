# Queue endpoints

import io
import os

import qrcode
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from database import get_db
from models import Location, Queue, QueueEntry, Restaurant
from schemas import QueueCreate, QueueStatusUpdate
from routers.restaurants import get_current_restaurant


router = APIRouter(prefix="/queues", tags=["Queues"])


def qr_code_response(queue_id: int) -> Response:
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5175").rstrip("/")
    join_url = f"{frontend_url}/join/{queue_id}"

    image = qrcode.make(join_url)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")

    return Response(
        content=buffer.getvalue(),
        media_type="image/png",
        headers={"Content-Disposition": f'inline; filename="vque-queue-{queue_id}.png"'},
    )


def get_owned_queue(queue_id: int, restaurant: Restaurant, db: Session):
    queue = db.query(Queue).join(Location, Queue.location_id == Location.id).filter(
        Queue.id == queue_id,
        Location.restaurant_id == restaurant.id
    ).first()

    if not queue:
        raise HTTPException(status_code=404, detail="Queue not found")

    return queue


@router.post("/{location_id}")
def create_queue(location_id: int, queue: QueueCreate, restaurant: Restaurant = Depends(get_current_restaurant), db: Session = Depends(get_db)):
    location = db.query(Location).filter(Location.id == location_id, Location.restaurant_id == restaurant.id).first()

    if not location:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")

    queue_count = db.query(Queue).filter(Queue.location_id == location.id).count()

    if queue_count >= 3:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Free plan allows a maximum of 3 queues per location")

    new_queue = Queue(location_id=location.id, name=queue.name)

    db.add(new_queue)
    db.commit()
    db.refresh(new_queue)

    return new_queue


@router.get("/{location_id}")
def get_queues(location_id: int, restaurant: Restaurant = Depends(get_current_restaurant), db: Session = Depends(get_db)):
    location = db.query(Location).filter(Location.id == location_id, Location.restaurant_id == restaurant.id).first()

    if not location:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")

    return db.query(Queue).filter(Queue.location_id == location.id).all()


@router.delete("/{queue_id}")
def delete_queue(queue_id: int, restaurant: Restaurant = Depends(get_current_restaurant), db: Session = Depends(get_db)):
    queue = get_owned_queue(queue_id, restaurant, db)

    db.query(QueueEntry).filter(QueueEntry.queue_id == queue.id).delete(synchronize_session=False)
    db.delete(queue)
    db.commit()

    return {"message": "Queue deleted"}


@router.patch("/{queue_id}/status")
async def update_queue_status(queue_id: int, update: QueueStatusUpdate, restaurant: Restaurant = Depends(get_current_restaurant), db: Session = Depends(get_db)):
    queue = get_owned_queue(queue_id, restaurant, db)
    queue.status = update.status
    db.commit()
    db.refresh(queue)

    from routers.queue_entries import manager
    await manager.broadcast(queue_id, {"type": "queue_updated", "action": "status_changed", "status": queue.status})

    return queue


@router.patch("/{queue_id}/entries/{entry_id}/{action}")
async def update_entry(queue_id: int, entry_id: int, action: str, restaurant: Restaurant = Depends(get_current_restaurant), db: Session = Depends(get_db)):
    queue = get_owned_queue(queue_id, restaurant, db)
    entry = db.query(QueueEntry).filter(QueueEntry.id == entry_id, QueueEntry.queue_id == queue.id).first()

    if not entry:
        raise HTTPException(status_code=404, detail="Queue entry not found")

    transitions = {
        "call": ("waiting", "called"),
        "serve": ("called", "serving"),
        "complete": ("serving", "completed"),
        "cancel": (("waiting", "called", "serving"), "cancelled"),
        "skip": (("waiting", "called"), "skipped")
    }

    if action not in transitions:
        raise HTTPException(status_code=400, detail="Invalid queue action")

    allowed_from, next_status = transitions[action]
    allowed_statuses = allowed_from if isinstance(allowed_from, tuple) else (allowed_from,)

    if entry.status not in allowed_statuses:
        raise HTTPException(status_code=400, detail=f"Cannot {action} a customer with status {entry.status}")

    entry.status = next_status
    db.commit()
    db.refresh(entry)

    from routers.queue_entries import manager
    await manager.broadcast(queue_id, {"type": "queue_updated", "action": action, "entry_id": entry.id, "status": entry.status})

    return entry


@router.get("/{queue_id}/qr")
def generate_qr(queue_id: int, restaurant: Restaurant = Depends(get_current_restaurant), db: Session = Depends(get_db)):
    queue = get_owned_queue(queue_id, restaurant, db)
    return qr_code_response(queue.id)


@router.get("/{queue_id}/qr/public")
def generate_public_qr(queue_id: int, db: Session = Depends(get_db)):
    queue = db.query(Queue).filter(Queue.id == queue_id).first()
    if not queue:
        raise HTTPException(status_code=404, detail="Queue not found")
    return qr_code_response(queue.id)


@router.get("/{queue_id}/public")
def get_public_queue(queue_id: int, db: Session = Depends(get_db)):
    queue = db.query(Queue).filter(Queue.id == queue_id).first()

    if not queue:
        raise HTTPException(status_code=404, detail="Queue not found")

    location = db.query(Location).filter(Location.id == queue.location_id).first()
    waiting_count = db.query(QueueEntry).filter(QueueEntry.queue_id == queue_id, QueueEntry.status == "waiting").count()
    active_count = db.query(QueueEntry).filter(
        QueueEntry.queue_id == queue_id,
        QueueEntry.status.in_(["waiting", "called", "serving"])
    ).count()

    return {
        "id": queue.id,
        "name": queue.name,
        "status": queue.status,
        "location_name": location.name,
        "city": location.city,
        "waiting_count": waiting_count,
        "active_count": active_count
    }
