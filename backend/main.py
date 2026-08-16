from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from enum import Enum
from typing import AsyncGenerator
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from uuid import UUID, uuid4

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, select
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Settings(BaseSettings):
    database_url: str = ""
    postgres_url: str = ""
    postgres_prisma_url: str = ""
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 60 * 24
    cors_origins: str = "*"
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def async_database_url(self) -> str:
        raw_url = self.database_url or self.postgres_url or self.postgres_prisma_url
        if not raw_url:
            return ""
        parts = urlsplit(raw_url)
        query = [(key, value) for key, value in parse_qsl(parts.query, keep_blank_values=True) if key not in {"sslmode", "pgbouncer", "connection_limit"}]
        normalized = urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))
        return normalized.replace("postgresql://", "postgresql+asyncpg://", 1).replace("postgres://", "postgresql+asyncpg://", 1)


settings = Settings()
engine = create_async_engine(settings.async_database_url, pool_pre_ping=True) if settings.database_url else None
SessionLocal = async_sessionmaker(engine, expire_on_commit=False) if engine else None
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


class Base(DeclarativeBase):
    pass


class Restaurant(Base):
    __tablename__ = "restaurants"
    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(160))
    slug: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    owner_email: Mapped[str] = mapped_column(String(255), index=True)
    address: Mapped[str | None] = mapped_column(Text)
    phone: Mapped[str | None] = mapped_column(String(40))
    currency: Mapped[str] = mapped_column(String(8), default="USD")
    timezone: Mapped[str] = mapped_column(String(64), default="UTC")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class MenuCategory(Base):
    __tablename__ = "menu_categories"
    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    restaurant_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class MenuItem(Base):
    __tablename__ = "menu_items"
    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    restaurant_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    category_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True))
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str | None] = mapped_column(Text)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    image_url: Mapped[str | None] = mapped_column(Text)
    available: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class RestaurantTable(Base):
    __tablename__ = "restaurant_tables"
    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    restaurant_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    table_number: Mapped[str] = mapped_column(String(32))
    qr_token: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    seats: Mapped[int] = mapped_column(Integer, default=2)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class OrderStatus(str, Enum):
    NEW = "new"
    ACCEPTED = "accepted"
    PREPARING = "preparing"
    READY = "ready"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class Order(Base):
    __tablename__ = "orders"
    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    restaurant_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    table_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True))
    order_number: Mapped[str] = mapped_column(String(32), index=True)
    status: Mapped[str] = mapped_column(String(32), default=OrderStatus.NEW.value)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0)
    tax: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0)
    total: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0)
    customer_name: Mapped[str | None] = mapped_column(String(160))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class OrderItem(Base):
    __tablename__ = "order_items"
    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    order_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    menu_item_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True))
    name: Mapped[str] = mapped_column(String(160))
    quantity: Mapped[int] = mapped_column(Integer)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    line_total: Mapped[Decimal] = mapped_column(Numeric(10, 2))


class Payment(Base):
    __tablename__ = "payments"
    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    restaurant_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    order_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    provider: Mapped[str] = mapped_column(String(32), default="manual")
    provider_payment_id: Mapped[str | None] = mapped_column(String(160))
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    status: Mapped[str] = mapped_column(String(32), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class UserRecord(BaseModel):
    id: str
    email: str
    restaurant_id: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RestaurantCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    slug: str = Field(pattern=r"^[a-z0-9-]+$", min_length=2, max_length=160)
    owner_email: str
    address: str | None = None
    phone: str | None = None


class RestaurantOut(RestaurantCreate):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    currency: str
    timezone: str


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None
    sort_order: int = Field(default=0, ge=0)


class CategoryOut(CategoryCreate):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    restaurant_id: UUID


class MenuItemCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str | None = None
    price: Decimal = Field(ge=0, decimal_places=2)
    category_id: UUID | None = None
    image_url: str | None = None
    available: bool = True
    sort_order: int = Field(default=0, ge=0)


class MenuItemOut(MenuItemCreate):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    restaurant_id: UUID


class TableCreate(BaseModel):
    table_number: str = Field(min_length=1, max_length=32)
    seats: int = Field(default=2, ge=1, le=50)


class TableOut(TableCreate):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    restaurant_id: UUID
    qr_token: str
    active: bool


class OrderItemCreate(BaseModel):
    menu_item_id: UUID
    quantity: int = Field(ge=1, le=50)


class OrderCreate(BaseModel):
    table_id: UUID | None = None
    customer_name: str | None = Field(default=None, max_length=160)
    notes: str | None = None
    items: list[OrderItemCreate] = Field(min_length=1)


class OrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    order_number: str
    status: str
    subtotal: Decimal
    tax: Decimal
    total: Decimal
    customer_name: str | None
    table_id: UUID | None
    created_at: datetime


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    if not SessionLocal:
        raise HTTPException(status_code=503, detail="DATABASE_URL is not configured")
    async with SessionLocal() as session:
        yield session


def hash_password(value: str) -> str:
    return pwd_context.hash(value)


def create_access_token(user: UserRecord) -> str:
    payload = {"sub": user.id, "email": user.email, "restaurant_id": user.restaurant_id, "exp": datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_minutes)}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


async def current_user(token: str = Depends(oauth2_scheme)) -> UserRecord:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        return UserRecord(id=str(payload["sub"]), email=str(payload["email"]), restaurant_id=str(payload["restaurant_id"]))
    except (JWTError, KeyError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token") from exc


app = FastAPI(title="QRServe API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins.split(","), allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "qrserve-api"}


@app.post("/auth/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends()) -> Token:
    # Replace this seed lookup with an accounts table when auth onboarding is added.
    if form_data.username != "owner@qrserve.test" or not pwd_context.verify(form_data.password, hash_password("demo-password")):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    return Token(access_token=create_access_token(UserRecord(id="demo-owner", email=form_data.username, restaurant_id="00000000-0000-0000-0000-000000000001")))


@app.get("/restaurants/me", response_model=RestaurantOut)
async def get_restaurant(user: UserRecord = Depends(current_user), db: AsyncSession = Depends(get_db)) -> Restaurant:
    restaurant = await db.get(Restaurant, UUID(user.restaurant_id))
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    return restaurant


@app.post("/restaurants", response_model=RestaurantOut, status_code=201)
async def create_restaurant(payload: RestaurantCreate, db: AsyncSession = Depends(get_db)) -> Restaurant:
    restaurant = Restaurant(**payload.model_dump())
    db.add(restaurant)
    await db.commit()
    await db.refresh(restaurant)
    return restaurant


@app.get("/menu/categories", response_model=list[CategoryOut])
async def list_categories(user: UserRecord = Depends(current_user), db: AsyncSession = Depends(get_db)) -> list[MenuCategory]:
    result = await db.execute(select(MenuCategory).where(MenuCategory.restaurant_id == UUID(user.restaurant_id)).order_by(MenuCategory.sort_order))
    return list(result.scalars())


@app.post("/menu/categories", response_model=CategoryOut, status_code=201)
async def create_category(payload: CategoryCreate, user: UserRecord = Depends(current_user), db: AsyncSession = Depends(get_db)) -> MenuCategory:
    category = MenuCategory(restaurant_id=UUID(user.restaurant_id), **payload.model_dump())
    db.add(category)
    await db.commit()
    await db.refresh(category)
    return category


@app.get("/menu/items", response_model=list[MenuItemOut])
async def list_menu_items(user: UserRecord = Depends(current_user), db: AsyncSession = Depends(get_db)) -> list[MenuItem]:
    result = await db.execute(select(MenuItem).where(MenuItem.restaurant_id == UUID(user.restaurant_id)).order_by(MenuItem.sort_order, MenuItem.name))
    return list(result.scalars())


@app.post("/menu/items", response_model=MenuItemOut, status_code=201)
async def create_menu_item(payload: MenuItemCreate, user: UserRecord = Depends(current_user), db: AsyncSession = Depends(get_db)) -> MenuItem:
    item = MenuItem(restaurant_id=UUID(user.restaurant_id), **payload.model_dump())
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@app.patch("/menu/items/{item_id}/availability", response_model=MenuItemOut)
async def update_availability(item_id: UUID, available: bool, user: UserRecord = Depends(current_user), db: AsyncSession = Depends(get_db)) -> MenuItem:
    item = await db.scalar(select(MenuItem).where(MenuItem.id == item_id, MenuItem.restaurant_id == UUID(user.restaurant_id)))
    if not item:
        raise HTTPException(status_code=404, detail="Menu item not found")
    item.available = available
    await db.commit()
    await db.refresh(item)
    return item


@app.get("/tables", response_model=list[TableOut])
async def list_tables(user: UserRecord = Depends(current_user), db: AsyncSession = Depends(get_db)) -> list[RestaurantTable]:
    result = await db.execute(select(RestaurantTable).where(RestaurantTable.restaurant_id == UUID(user.restaurant_id)).order_by(RestaurantTable.table_number))
    return list(result.scalars())


@app.post("/tables", response_model=TableOut, status_code=201)
async def create_table(payload: TableCreate, user: UserRecord = Depends(current_user), db: AsyncSession = Depends(get_db)) -> RestaurantTable:
    table = RestaurantTable(restaurant_id=UUID(user.restaurant_id), qr_token=secrets.token_urlsafe(24), **payload.model_dump())
    db.add(table)
    await db.commit()
    await db.refresh(table)
    return table


@app.get("/orders", response_model=list[OrderOut])
async def list_orders(status_filter: OrderStatus | None = None, user: UserRecord = Depends(current_user), db: AsyncSession = Depends(get_db)) -> list[Order]:
    query = select(Order).where(Order.restaurant_id == UUID(user.restaurant_id)).order_by(Order.created_at.desc())
    if status_filter:
        query = query.where(Order.status == status_filter.value)
    result = await db.execute(query)
    return list(result.scalars())


@app.patch("/orders/{order_id}/status", response_model=OrderOut)
async def update_order_status(order_id: UUID, status_value: OrderStatus, user: UserRecord = Depends(current_user), db: AsyncSession = Depends(get_db)) -> Order:
    order = await db.scalar(select(Order).where(Order.id == order_id, Order.restaurant_id == UUID(user.restaurant_id)))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    order.status = status_value.value
    await db.commit()
    await db.refresh(order)
    return order


@app.get("/dashboard/analytics")
async def dashboard_analytics(user: UserRecord = Depends(current_user), db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    restaurant_id = UUID(user.restaurant_id)
    orders = list((await db.execute(select(Order).where(Order.restaurant_id == restaurant_id).order_by(Order.created_at))).scalars())
    items = list((await db.execute(select(OrderItem).join(Order, Order.id == OrderItem.order_id).where(Order.restaurant_id == restaurant_id))).scalars())
    menu_items = {item.id: item for item in (await db.execute(select(MenuItem).where(MenuItem.restaurant_id == restaurant_id))).scalars().all()}
    categories = {category.id: category.name for category in (await db.execute(select(MenuCategory).where(MenuCategory.restaurant_id == restaurant_id))).scalars().all()}
    completed = [order for order in orders if order.status == OrderStatus.COMPLETED.value]
    if not completed:
        return {"has_data": False, "orders_count": 0, "best_sellers": [], "lowest_sellers": [], "revenue_trend": [], "peak_hour": None, "popular_category": None, "average_order_value": "0.00", "pairs": []}
    item_stats: dict[UUID, dict[str, object]] = {}
    for line in items:
        order = next((candidate for candidate in completed if candidate.id == line.order_id), None)
        if not order:
            continue
        stat = item_stats.setdefault(line.menu_item_id or line.id, {"name": line.name, "quantity": 0, "revenue": Decimal("0"), "category": None})
        stat["quantity"] = int(stat["quantity"]) + line.quantity
        stat["revenue"] = Decimal(str(stat["revenue"])) + line.line_total
        if line.menu_item_id in menu_items:
            category_id = menu_items[line.menu_item_id].category_id
            stat["category"] = categories.get(category_id) if category_id else None
    ranked = sorted(item_stats.values(), key=lambda value: (int(value["quantity"]), Decimal(str(value["revenue"]))), reverse=True)
    hours: dict[str, Decimal] = {}
    category_counts: dict[str, int] = {}
    for order in completed:
        key = order.created_at.strftime("%H:00")
        hours[key] = hours.get(key, Decimal("0")) + order.total
    for stat in ranked:
        category = stat["category"] or "Uncategorized"
        category_counts[category] = category_counts.get(category, 0) + int(stat["quantity"])
    return {"has_data": True, "orders_count": len(completed), "best_sellers": [{"name": stat["name"], "quantity": stat["quantity"], "revenue": f"{Decimal(str(stat['revenue'])):.2f}"} for stat in ranked[:5]], "lowest_sellers": [{"name": stat["name"], "quantity": stat["quantity"], "revenue": f"{Decimal(str(stat['revenue'])):.2f}"} for stat in ranked[-5:][::-1]], "revenue_trend": [{"hour": hour, "revenue": f"{revenue:.2f}"} for hour, revenue in sorted(hours.items())], "peak_hour": max(hours, key=hours.get) if hours else None, "popular_category": max(category_counts, key=category_counts.get) if category_counts else None, "average_order_value": f"{sum((order.total for order in completed), Decimal('0')) / len(completed):.2f}", "pairs": []}


@app.get("/dashboard/summary")
async def dashboard_summary(user: UserRecord = Depends(current_user), db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    result = await db.execute(select(Order).where(Order.restaurant_id == UUID(user.restaurant_id)))
    orders = list(result.scalars())
    active = [order for order in orders if order.status not in {OrderStatus.COMPLETED.value, OrderStatus.CANCELLED.value}]
    revenue = sum((order.total for order in orders if order.status == OrderStatus.COMPLETED.value), Decimal("0"))
    return {"orders_today": len(orders), "active_orders": len(active), "revenue_today": revenue, "average_order": revenue / len(orders) if orders else Decimal("0")}


@app.get("/public/restaurants/{restaurant_slug}")
async def public_restaurant(restaurant_slug: str, db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    restaurant = await db.scalar(select(Restaurant).where(Restaurant.slug == restaurant_slug))
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    return {"id": str(restaurant.id), "name": restaurant.name, "slug": restaurant.slug, "address": restaurant.address, "phone": restaurant.phone, "currency": restaurant.currency, "timezone": restaurant.timezone}


@app.get("/public/restaurants/{restaurant_slug}/tables/{table_id}")
async def public_table(restaurant_slug: str, table_id: UUID, db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    restaurant = await db.scalar(select(Restaurant).where(Restaurant.slug == restaurant_slug))
    table = await db.scalar(select(RestaurantTable).where(RestaurantTable.id == table_id, RestaurantTable.restaurant_id == restaurant.id if restaurant else False, RestaurantTable.active.is_(True)))
    if not restaurant or not table:
        raise HTTPException(status_code=404, detail="Table not found")
    return {"id": str(table.id), "table_number": table.table_number, "seats": table.seats, "active": table.active}


@app.get("/public/restaurants/{restaurant_slug}/menu")
async def public_menu(restaurant_slug: str, db: AsyncSession = Depends(get_db)) -> dict[str, list[dict[str, object]]]:
    restaurant = await db.scalar(select(Restaurant).where(Restaurant.slug == restaurant_slug))
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    categories = (await db.execute(select(MenuCategory).where(MenuCategory.restaurant_id == restaurant.id).order_by(MenuCategory.sort_order))).scalars().all()
    items = (await db.execute(select(MenuItem).where(MenuItem.restaurant_id == restaurant.id, MenuItem.available.is_(True)).order_by(MenuItem.sort_order, MenuItem.name))).scalars().all()
    return {"categories": [{"id": str(c.id), "name": c.name, "description": c.description} for c in categories], "items": [{"id": str(i.id), "category_id": str(i.category_id) if i.category_id else None, "name": i.name, "description": i.description, "price": str(i.price), "image_url": i.image_url} for i in items]}


@app.post("/public/restaurants/{restaurant_slug}/orders", response_model=OrderOut, status_code=201)
async def public_create_order(restaurant_slug: str, payload: OrderCreate, db: AsyncSession = Depends(get_db)) -> Order:
    restaurant = await db.scalar(select(Restaurant).where(Restaurant.slug == restaurant_slug))
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    if payload.table_id:
        table = await db.scalar(select(RestaurantTable).where(RestaurantTable.id == payload.table_id, RestaurantTable.restaurant_id == restaurant.id, RestaurantTable.active.is_(True)))
        if not table:
            raise HTTPException(status_code=400, detail="Invalid table")
    item_ids = [item.menu_item_id for item in payload.items]
    menu_items_result = await db.execute(select(MenuItem).where(MenuItem.id.in_(item_ids), MenuItem.restaurant_id == restaurant.id, MenuItem.available.is_(True)))
    menu_items = {item.id: item for item in menu_items_result.scalars().all()}
    if len(menu_items) != len(set(item_ids)):
        raise HTTPException(status_code=400, detail="One or more menu items are unavailable")
    subtotal = sum((menu_items[line.menu_item_id].price * line.quantity for line in payload.items), Decimal("0.00"))
    tax = (subtotal * Decimal("0.08875")).quantize(Decimal("0.01"))
    order = Order(restaurant_id=restaurant.id, table_id=payload.table_id, order_number=f"{secrets.randbelow(9000) + 1000}", subtotal=subtotal, tax=tax, total=subtotal + tax, customer_name=payload.customer_name, notes=payload.notes)
    db.add(order)
    await db.flush()
    for line in payload.items:
        item = menu_items[line.menu_item_id]
        db.add(OrderItem(order_id=order.id, menu_item_id=item.id, name=item.name, quantity=line.quantity, unit_price=item.price, line_total=item.price * line.quantity))
    await db.commit()
    await db.refresh(order)
    return order


@app.get("/public/orders/{order_id}", response_model=OrderOut)
async def public_order_status(order_id: UUID, db: AsyncSession = Depends(get_db)) -> Order:
    order = await db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@app.post("/payments/webhook")
async def payment_webhook(request: Request, db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    # Provider signature verification belongs here before mutating payment/order state.
    payload = await request.json()
    if not payload.get("order_id") or not payload.get("status"):
        raise HTTPException(status_code=400, detail="order_id and status are required")
    return {"received": "true"}
