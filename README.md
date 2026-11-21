# RENTIVO — Equipment Rental Platform (Server)

REST API for the RENTIVO equipment rental platform. It handles users and roles,
equipment, favorites, bookings, Stripe payments, contact messages and dashboard
analytics.

## Purpose
The server secures every private request with JWT verification and role-based
middleware, so Customers, Owners and Admins can only perform the actions their
role allows.

## Live URL
- Server API: https://rentivo-server-b2al.onrender.com/
- Client: https://rentivo-ten.vercel.app/
- Client repository: https://github.com/yeasinkhan08/rentivo-client

## Key Features
- JWT verification with role middlewares: `verifyToken`, `verifyRenter`, `verifyOwner`, `verifyAdmin` (role checked against the database on every request)
- Equipment CRUD with admin approval (pending, approved, rejected)
- Server-side search, filtering, sorting and pagination
- Favorites saved per customer
- Booking availability check against overlapping bookings and server-side total calculation
- Stripe Checkout; payment is verified with Stripe before the booking and transaction are saved, and duplicate bookings are blocked
- Rental lists for customers, owners and admins
- Admin analytics (users, equipment, bookings, pending approvals, completed rentals, total revenue, monthly statistics) and owner analytics (listed equipment, completed rentals, total earnings, monthly earnings)
- Contact message storage

## npm Packages Used
- express
- cors
- dotenv
- cookie-parser
- mongodb
- jsonwebtoken
- stripe
- nodemon (development)


## Run Locally
```
git clone https://github.com/yeasinkhan08/rentivo-server.git
cd rentivo-server
npm install
npm run dev
```
https://rentivo-server-b2al.onrender.com
