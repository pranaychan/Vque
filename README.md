# Vque

Vque is a virtual queue management system for restaurants. Restaurants can manage locations and queues, while customers join queues through a QR/link with only their name and group size and track their position.

## Stack

- React + Vite + React Router
- FastAPI + SQLAlchemy + PostgreSQL
- JWT authentication
- Argon2 password hashing via pwdlib
- SMTP email verification/password reset in development
- Resend email delivery in production
- WebSockets for restaurant queue updates
- Docker Compose

## Setup

1. Copy `.env.example` to `.env`.
2. Replace `SECRET_KEY` and the PostgreSQL password with strong values.
3. For local development, leave `APP_ENV=development`. Email codes are logged by the backend and are never returned by the API.
4. Start the stack:

```bash
docker compose up --build
```

5. Open `http://localhost:5175`.
6. API docs: `http://localhost:8000/docs`.

## Email

Email delivery is selected automatically from `APP_ENV`:

- `development`: SMTP using `SMTP_*` variables.
- `production`: Resend using `RESEND_API_KEY` and `EMAIL_FROM`.

Local development example:

```env
APP_ENV=development
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-gmail@gmail.com
SMTP_PASSWORD=your-google-app-password
SMTP_FROM=your-gmail@gmail.com
SMTP_USE_SSL=false
```

Production example:

```env
APP_ENV=production
RESEND_API_KEY=re_xxxxxxxxx
EMAIL_FROM=onboarding@resend.dev
```

After changing environment variables, recreate the backend container:

```bash
docker compose up -d --build --force-recreate backend
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
- Restaurant access JWTs and customer queue-session JWTs use explicit purposes.
- Email verification has cooldown and attempt limits.
- Password reset requests have a cooldown and generic responses to reduce account enumeration.
- PostgreSQL is not exposed on the host; the backend reaches it over the Compose network.

## Customer queue access

Customers do not need to create an account, provide a phone number, or enter an OTP. Scanning a queue QR code opens `/join/:queueId`, where they enter their name and group size and immediately receive a signed queue-session token stored on that device.


## Restaurant demo mode

Prospective restaurant teams can try the management dashboard without registering or entering an email. Open `/demo` from the frontend or click **Try live demo** on the home/login page. The backend creates a sample restaurant workspace, signs a short-lived demo token, and loads sample locations, queues, and customers.

Demo changes are intentionally temporary: starting a new demo session resets the shared demo workspace to its sample state. For deployments where this should not be public, set `DEMO_MODE_ENABLED=false`.
