# Loan Management System

Secure small-scale lending dashboard for clients, loans, repayments, collateral, and company details.

## New login features

- Create account with email and password
- Login with email/username and password
- Forgot password flow with reset code
- Google OAuth sign-in support when configured

## Run locally

```powershell
npm install
npm run init-db
npm start
```

Open:

```text
http://localhost:5000
```

Default test login:

```text
Email: admin@example.com
Username: admin
Password: admin123
```

## Forgot password note

For demo use, the reset code is shown on the screen. In production, connect an email service so the reset code is sent to the user's email.

## Google OAuth setup

Email/password works immediately. To enable the Google button:

1. Create an OAuth Client ID in Google Cloud Console.
2. Add your local/hosted domain as an allowed origin.
3. Set this environment variable before starting or on Render:

```text
GOOGLE_CLIENT_ID=your_google_client_id_here
```

Then restart the app.
