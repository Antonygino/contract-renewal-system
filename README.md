# 🛡️ RenewalTrack — Contract & Document Renewal Tracking System

A full-stack **MERN** application (MongoDB, Express.js, React 18 + Vite, Node.js) designed to monitor, track, and alert users regarding contract, license, warranty, and document expiration dates.

---

## 🚀 Quick Start / Terminal Prompts

### Prerequisites
- **Node.js** (v18+ recommended)
- **MongoDB** running locally on `mongodb://localhost:27017`

### 1. Start the Backend API Server
Open Terminal 1:
```powershell
cd "d:\fsd project\server"
npm run dev
```
> Server runs on: **http://localhost:5000**  
> API Base URL: **http://localhost:5000/api**  
> Health Check: **http://localhost:5000/api/health**

---

### 2. Start the Frontend React Application
Open Terminal 2:
```powershell
cd "d:\fsd project\client"
npm run dev
```
> Web Application opens on: **http://localhost:5173**

---

### 3. (Optional) Seed Sample Contracts & Demo Data
To preload or reset rich contracts, licenses, and charts:
```powershell
cd "d:\fsd project\server"
npm run seed
```

---

## 🔑 Login Credentials

| Role | Email Address | Password | Details |
|------|---------------|----------|---------|
| **Demo User** | `fsd@test.com` | `Test@1234` | Preloaded with 7 sample documents across all expiry categories |
| **System Admin** | `admin@renewaltrack.com` | `Admin@1234` | Administrative privileges |
| **New Account** | *Any email* | *6+ characters* | Register directly at `http://localhost:5173/register` |

---

## 📂 Project Architecture

```
d:\fsd project\
├── client/                     # React 18 Frontend (Vite)
│   ├── src/
│   │   ├── api/                # Axios instance & centralized API services
│   │   ├── components/         # Layout, Sidebar, Modal, Route Guards
│   │   ├── context/            # AuthContext (JWT & user state)
│   │   ├── pages/              # Dashboard, Documents, Alerts, Reports, Profile, Login, Register
│   │   ├── index.css           # Modern design system & animations
│   │   └── App.jsx             # Router configuration
│   └── package.json
│
└── server/                     # Node.js + Express.js Backend
    ├── config/                 # MongoDB database connection
    ├── controllers/            # Auth, Document CRUD, & Report logic
    ├── middleware/             # JWT auth protection & error handlers
    ├── models/                 # User and Document Mongoose schemas
    ├── routes/                 # REST API endpoints
    ├── utils/                  # Cron scheduler & Nodemailer alerts
    ├── seed.js                 # Database seeder
    ├── test.api.js             # Automated API integration test suite
    └── server.js               # Express app bootstrap
```

---

## 🧪 Automated Testing

### 1. Fast API Integration Suite (16 Tests)
```powershell
npm test
# Or from server:
npm run test:api --prefix server
```

### 2. Comprehensive End-to-End Security & Status Code Audit (41 Tests)
Covers all HTTP status codes (200, 201, 400, 401, 403, 404, 409, 422), IDOR prevention, RBAC, NoSQL injection, Regex escaping, Excel formula injection, deactivated user token revocation, and MongoDB persistence:
```powershell
npm run test:audit
# Or from server:
npm run test:audit --prefix server
```
