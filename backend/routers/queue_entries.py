# Queue entry endpoints and realtime updates.

from datetime import timedelta

from fastapi import APIRouter, Depends, Header, HTTPException, WebSocket, WebSocketDisconnect, status
from sqlalchemy.orm import Session

from auth import create_access_token, verify_access_token
from database import get_db
from models import Location, Queue, QueueEntry
from routers.restaurants import get_current_restaurant
from schemas import QueueEntryCreate


router = APIRouter(prefix="/queue-entries", tags=["Queue Entries"])
ACTIVE_STATUSES = ("waiting", "called", "serving")


class ConnectionManager:
    def __init__(self):
        self.connections = {}

    async def connect(self, queue_id, websocket):
        await websocket.accept()
        self.connections.setdefault(queue_id, []).append(websocket)

    def disconnect(self, queue_id, websocket):
        if queue_id in self.connections and websocket in self.connections[queue_id]:
            self.connections[queue_id].remove(websocket)

    async def broadcast(self, queue_id, message):
        for websocket in list(self.connections.get(queue_id, [])):
            try:
                await websocket.send_json(message)
            except Exception:
                self.disconnect(queue_id, websocket)


manager = ConnectionManager()


def verify_customer_token(token: str, phone_number: str):
    payload = verify_access_token(token)
    if (not payload or payload.get("purpose") != "phone_verification"
            or payload.get("otp_phone") != phone_number or not payload.get("otp_verification_id")):
        raise HTTPException(status_code=401, detail="Phone verification is required")
    return payload


def create_guest_session_token(entry_id: int) -> str:
    return create_access_token(
        {"purpose": "guest_queue_entry", "entry_id": str(entry_id)},
        timedelta(hours=24),
    )


def get_bearer_token(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Queue access token is required")
    return authorization[7:]


def get_customer_entry(entry_id: int, authorization: str | None, db: Session) -> QueueEntry:
    payload = verify_access_token(get_bearer_token(authorization))
    if (not payload
            or payload.get("purpose") not in {"queue_entry", "guest_queue_entry"}
            or str(payload.get("entry_id")) != str(entry_id)):
        raise HTTPException(status_code=401, detail="This queue session is invalid or expired")
    entry = db.query(QueueEntry).filter(QueueEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Queue entry not found")
    return entry


def active_entries(queue_id: int, db: Session):
    return db.query(QueueEntry).filter(
        QueueEntry.queue_id == queue_id,
        QueueEntry.status.in_(ACTIVE_STATUSES)
    ).order_by(QueueEntry.joined_at, QueueEntry.id).all()


def serialize_customer_entry(entry: QueueEntry, db: Session):
    entries = active_entries(entry.queue_id, db)
    position = next((index + 1 for index, item in enumerate(entries) if item.id == entry.id), 0)
    return {
        "id": entry.id,
        "customer_name": entry.customer_name,
        "group_size": entry.group_size,
        "is_guest": entry.is_guest,
        "status": entry.status,
        "joined_at": entry.joined_at,
        "position": position,
        "people_ahead": max(position - 1, 0) if entry.status in ACTIVE_STATUSES else 0,
        "active_count": len(entries),
    }


@router.get("/manage/{queue_id}")
def get_manage_queue_entries(queue_id: int, restaurant=Depends(get_current_restaurant), db: Session = Depends(get_db)):
    queue = db.query(Queue).join(Location, Queue.location_id == Location.id).filter(
        Queue.id == queue_id, Location.restaurant_id == restaurant.id
    ).first()
    if not queue:
        raise HTTPException(status_code=404, detail="Queue not found")
    return active_entries(queue_id, db)


@router.get("/entry/{entry_id}")
def get_entry_position(entry_id: int, authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    return serialize_customer_entry(get_customer_entry(entry_id, authorization, db), db)


@router.delete("/entry/{entry_id}")
async def leave_queue(entry_id: int, authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    entry = get_customer_entry(entry_id, authorization, db)
    if entry.status not in ACTIVE_STATUSES:
        raise HTTPException(status_code=400, detail="This queue entry is no longer active")
    entry.status = "cancelled"
    db.commit()
    await manager.broadcast(entry.queue_id, {"type": "queue_updated", "action": "left", "entry_id": entry.id})
    return {"message": "You have left the queue"}


@router.post("/{queue_id}")
async def join_queue(queue_id: int, entry: QueueEntryCreate, db: Session = Depends(get_db)):
    if entry.guest_mode:
        if entry.verification_token or entry.phone_number:
            raise HTTPException(status_code=400, detail="Guest mode does not require phone verification")
    else:
        if not entry.phone_number or not entry.verification_token:
            raise HTTPException(status_code=401, detail="Phone verification is required")
        verify_customer_token(entry.verification_token, entry.phone_number)

    queue = db.query(Queue).filter(Queue.id == queue_id).first()
    if not queue:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Queue not found")
    if queue.status != "open":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Queue is not accepting new customers")

    if not entry.guest_mode:
        existing_entry = db.query(QueueEntry).filter(
            QueueEntry.queue_id == queue_id,
            QueueEntry.phone_number == entry.phone_number,
            QueueEntry.status.in_(ACTIVE_STATUSES)
        ).first()
        if existing_entry:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This phone number is already active in the queue")

    new_entry = QueueEntry(
        queue_id=queue_id,
        customer_name=entry.customer_name,
        phone_number=entry.phone_number,
        is_guest=entry.guest_mode,
        group_size=entry.group_size,
    )
    db.add(new_entry)
    db.commit()
    db.refresh(new_entry)
    customer_session_token = (
        create_guest_session_token(new_entry.id)
        if entry.guest_mode
        else create_access_token({"purpose": "queue_entry", "entry_id": str(new_entry.id)}, timedelta(hours=24))
    )
    entry_data = serialize_customer_entry(new_entry, db)
    await manager.broadcast(queue_id, {"type": "queue_updated", "action": "joined", "entry_id": new_entry.id})
    return {"message": "Successfully joined queue", "entry_id": new_entry.id, "queue_session_token": customer_session_token, **entry_data}


@router.websocket("/ws/customer/{queue_id}")
async def customer_queue_websocket(websocket: WebSocket, queue_id: int, token: str = ""):
    payload = verify_access_token(token)
    if (not payload
            or payload.get("purpose") not in {"queue_entry", "guest_queue_entry"}
            or not payload.get("entry_id")):

        await websocket.close(code=1008)
        return

    db = next(get_db())
    try:
        try:
            entry_id = int(payload["entry_id"])
        except (TypeError, ValueError):
            await websocket.close(code=1008)
            return
        entry = db.query(QueueEntry).filter(QueueEntry.id == entry_id, QueueEntry.queue_id == queue_id).first()
        if not entry:
            await websocket.close(code=1008)
            return
        await manager.connect(queue_id, websocket)
        try:
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            manager.disconnect(queue_id, websocket)
    finally:
        db.close()


@router.websocket("/ws/{queue_id}")
async def queue_websocket(websocket: WebSocket, queue_id: int, token: str = ""):
    payload = verify_access_token(token)
    if not payload or payload.get("purpose") != "restaurant_access" or "sub" not in payload:
        await websocket.close(code=1008)
        return
    db = next(get_db())
    try:
        queue = db.query(Queue).join(Location, Queue.location_id == Location.id).filter(
            Queue.id == queue_id, Location.restaurant_id == int(payload["sub"])
        ).first()
        if not queue:
            await websocket.close(code=1008)
            return
        await manager.connect(queue_id, websocket)
        try:
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            manager.disconnect(queue_id, websocket)
    finally:
        db.close()
