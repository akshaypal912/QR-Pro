# QRServe FastAPI backend

A modular FastAPI service for QRServe restaurant operations. The API uses async SQLAlchemy with PostgreSQL and is mounted by Vercel under `/api`.

## Runtime configuration

- `DATABASE_URL`: Neon PostgreSQL connection string.
- `JWT_SECRET`: long random secret for access tokens.
- `CORS_ORIGINS`: comma-separated allowed origins.

## Routes

- `GET /health`
- `POST /auth/login`
- `GET|POST /restaurants`
- `GET|POST /menu/categories`
- `GET|POST /menu/items`
- `PATCH /menu/items/{item_id}/availability`
- `GET|POST /tables`
- `GET /orders`
- `PATCH /orders/{order_id}/status`
- `GET /dashboard/summary`
- `POST /payments/webhook`

The protected endpoints expect an OAuth2 bearer token. The temporary demo login is `owner@qrserve.test` / `demo-password`; replace it with a persisted users table and a real identity flow before production use.
