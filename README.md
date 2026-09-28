# Vque

Vque is a virtual queue management system for restaurants. Restaurants can manage locations and queues, while customers join queues through a QR/link, verify their phone, and track their position.

## Stack

- React + Vite + React Router
- FastAPI + SQLAlchemy + PostgreSQL
- JWT authentication
- Argon2 password hashing via pwdlib
- SMTP email verification/password reset
- Local development OTP adapter
- WebSockets for restaurant queue updates
- Docker Compose

## Setup

1. Copy `.env.example` to `.env`.
2. Replace `SECRET_KEY` and the PostgreSQL password with strong values.
3. For local development, leave `EMAIL_DEV_MODE=true`. Email codes are logged by the backend and are never returned by the API.
4. Start the stack:

```bash
docker compose up --build
```

5. Open `http://localhost:5175`.
6. API docs: `http://localhost:8000/docs`.

## SMTP

Set `EMAIL_DEV_MODE=false` and configure:

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USERNAME=your-user
SMTP_PASSWORD=your-password
SMTP_FROM=verified-sender@example.com
SMTP_USE_SSL=false
```

For providers using implicit TLS/SMTPS:

```env
SMTP_PORT=465
SMTP_USE_SSL=true
```

The backend logs the actual SMTP exception server-side without exposing credentials or provider internals to the client. After changing environment variables, recreate the backend container:

```bash
docker compose up -d --build --force-recreate backend
```

Then inspect delivery failures with:

```bash
docker compose logs -f backend
```

## Database

For development, the backend creates any missing PostgreSQL tables from the SQLAlchemy models when it starts. It does not drop or reset existing tables.

To completely reset the development database and recreate it from scratch:

```bash
docker compose down -v
docker compose up --build
```

`down -v` deletes the PostgreSQL Docker volume, so use it only when you are okay losing local database data.

## Tests

```bash
cd backend
python -m pip install -r requirements-dev.txt
python -m pytest
```

## Security notes

- `.env` is intentionally not committed. Only `.env.example` belongs in Git.
- If secrets were ever committed previously, rotate them before deployment.
- Restaurant access JWTs and customer verification/queue-session JWTs use explicit purposes.
- Email verification has cooldown and attempt limits.
- Password reset requests have a cooldown and generic responses to reduce account enumeration.
- Customer OTPs are HMAC-hashed, expire after five minutes, have a resend cooldown, and have an attempt limit.
- PostgreSQL is not exposed on the host; the backend reaches it over the Compose network.

## Customer guest mode

Customers do not need to create an account or verify a phone number to join a queue. From a queue's public `/join/:queueId` page, they can choose **Continue as guest**, enter their name and group size, and receive a signed queue-session token stored locally on their device.

Phone verification remains available for customers who want the verified flow. Guest entries intentionally do not store a phone number and are allowed to rejoin the same queue independently.


## Restaurant demo mode

Prospective restaurant teams can try the management dashboard without registering or entering an email. Open `/demo` from the frontend or click **Try live demo** on the home/login page. The backend creates a sample restaurant workspace, signs a short-lived demo token, and loads sample locations, queues, and customers.

Demo changes are intentionally temporary: starting a new demo session resets the shared demo workspace to its sample state. For deployments where this should not be public, set `DEMO_MODE_ENABLED=false`.
