# Restaurant endpoints

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from auth import verify_access_token
from database import get_db
from models import Restaurant

router = APIRouter(prefix="/restaurants", tags=["Restaurants"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def get_current_restaurant(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    payload = verify_access_token(token)
    if not payload or payload.get("purpose") != "restaurant_access" or "sub" not in payload:

        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    try:
        restaurant_id = int(payload["sub"])
    except (TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token subject")

    restaurant = db.query(Restaurant).filter(Restaurant.id == restaurant_id).first()
    if not restaurant:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Restaurant not found")
    if payload.get("demo") is True and not restaurant.is_demo:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid demo token")
    return restaurant


@router.get("/me")
def get_my_restaurant(restaurant: Restaurant = Depends(get_current_restaurant)):
    return {"id": restaurant.id, "name": restaurant.name, "email": restaurant.email, "is_demo": restaurant.is_demo}
