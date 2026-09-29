# Care Companionship - Backend REST API (Phase 1)

Production-ready backend API for the **Care Companionship** mobile application. This system connects lonely seniors, recovering patients, and care seekers with verified, trained caregivers and empathetic companions.

---

## 📁 Project Structure

```text
backend/
├── config/
│   ├── db.js                 # MongoDB Atlas connection with Mongoose & lifecycle events
│   └── cloudinary.js         # Cloudinary SDK & Multer memory storage for ID/avatar uploads
├── controllers/
│   ├── adminController.js     # Admin metrics, user bans, companion verification approvals
│   ├── authController.js      # JWT register, login, token refresh, logout, profile update
│   ├── bookingController.js   # Booking lifecycle (request, accept, complete, cancel)
│   ├── companionController.js # Companion search, filter, profile management, ID upload
│   ├── chatController.js      # In-app messaging, threads, read receipts & push notifications
│   ├── reportController.js    # Grievance & incident reporting
│   ├── reviewController.js    # Post-care rating & reviews with automated aggregate calculation
│   └── sosController.js       # Real-time SOS alert dispatch with location & emergency contact
├── middleware/
│   ├── authMiddleware.js      # JWT verification (`protect`) and role-based access (`authorize`)
│   ├── errorMiddleware.js     # Centralized 404 & error handlers (Mongoose, JWT, validation)
│   ├── rateLimiter.js         # IP rate limiting for API & brute-force auth protection
│   └── validationMiddleware.js# express-validator schemas for input sanitation
├── models/
│   ├── Booking.js             # Booking transactions, schedule, rates, statuses
│   ├── CompanionProfile.js    # Caregiver skills, hourly rates, availability, ID vetting
│   ├── Message.js             # In-app chat messages, media, location, system alerts
│   ├── Report.js              # User complaints & resolution audit logs
│   ├── Review.js              # Care seeker feedback & ratings (1-5 stars)
│   └── User.js                # Core user schema (seeker, companion, admin) with bcrypt hooks
├── routes/
│   ├── adminRoutes.js         # /api/admin/*
│   ├── authRoutes.js          # /api/auth/*
│   ├── bookingRoutes.js       # /api/bookings/*
│   ├── companionRoutes.js     # /api/companions/*
│   ├── chatRoutes.js          # /api/chat/*
│   ├── reportRoutes.js        # /api/reports/*
│   ├── reviewRoutes.js        # /api/reviews/*
│   └── sosRoutes.js           # /api/sos/*
├── scripts/
│   └── seed.js                # Database seeder with realistic test data (Admin, Companions, Seekers)
├── utils/
│   ├── jwtHelper.js           # Access (15m) & Refresh (7d) token generation/verification
│   └── pushNotification.js   # Expo Push Notification dispatcher for mobile push alerts
├── .env.example               # Template for environment variables
├── package.json               # Backend dependencies & Render start script (`node server.js`)
└── server.js                  # Main entry point with Helmet, CORS, Morgan, and Express config
```

---

## ⚙️ Environment Variables Setup

Create a `.env` file inside the `backend/` directory:

```env
PORT=5000
NODE_ENV=development

# MongoDB Atlas Database URI
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/care_companionship?retryWrites=true&w=majority

# JWT Token Secrets (Use strong 32+ char secrets in production)
JWT_ACCESS_SECRET=care_companionship_access_jwt_secret_super_secure_key_2026
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_SECRET=care_companionship_refresh_jwt_secret_ultra_safe_key_2026
JWT_REFRESH_EXPIRES_IN=7d

# Cloudinary Setup for ID Card & Photo Uploads
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Expo Push Notifications (Optional token for rate limits)
EXPO_ACCESS_TOKEN=

# CORS Settings (* for mobile apps or specify domain)
CORS_ORIGIN=*
```

---

## 🚀 Local Installation & Execution

1. Navigate to the backend folder:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Seed database with demo accounts & bookings:
   ```bash
   npm run seed
   ```

4. Start development server:
   ```bash
   npm run dev
   # or in production:
   npm start
   ```

---

## 🔑 Default Seeded Demo Accounts

| Role | Email | Password | Details |
|---|---|---|---|
| **Admin** | `admin@carecompanionship.com` | `AdminCare2026!` | Super Admin, access to verification queue & metrics |
| **Companion** | `maryam.companion@care.com` | `Password123!` | Certified Geriatric Caregiver, Lahore (PKR 600/hr) |
| **Companion** | `ahmed.companion@care.com` | `Password123!` | Physiotherapy & Mobility Aide, Karachi (PKR 750/hr) |
| **Companion** | `zainab.companion@care.com` | `Password123!` | Reading & Emotional Support, Islamabad (PKR 500/hr) |
| **Care Seeker** | `tariq@gmail.com` | `Password123!` | 72yo Senior, Post-surgery walking assistance |
| **Care Seeker** | `fatima@gmail.com` | `Password123!` | 68yo Senior, Parkinson's care & companionship |

---

## 📡 Complete REST API Documentation

### 1. Health & Server Info
- **GET** `/api/health`
  - Response: `{ status: "healthy", service: "Care Companionship API", uptime: 120 }`

---

### 2. Authentication (`/api/auth`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Register as `seeker` or `companion` |
| `POST` | `/api/auth/login` | Public | Login with email & password, returns JWT tokens |
| `POST` | `/api/auth/refresh-token` | Public | Obtain new access token via refresh token |
| `POST` | `/api/auth/logout` | Private | Revoke refresh token |
| `GET` | `/api/auth/me` | Private | Fetch logged-in user profile & companion details |
| `PUT` | `/api/auth/profile` | Private | Update user personal details, emergency contact |
| `PUT` | `/api/auth/push-token` | Private | Register device `expoPushToken` for alerts |
| `PUT` | `/api/auth/change-password` | Private | Change account password |

#### Example: Register as Seeker
```json
POST /api/auth/register
{
  "name": "Kamran Ali",
  "email": "kamran@gmail.com",
  "password": "Password123!",
  "role": "seeker",
  "phone": "+923001234567",
  "city": "Lahore",
  "age": 70,
  "careNeeds": "Requires morning walk companion and light conversation",
  "emergencyContact": {
    "name": "Hamza Ali (Son)",
    "phone": "+923007654321",
    "relationship": "Son"
  }
}
```

---

### 3. Companions & Caregivers (`/api/companions`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/companions` | Public | Search companions with filters (`city`, `service`, `minRating`, `maxPrice`, `search`) |
| `GET` | `/api/companions/:id` | Public | Get full companion profile, reviews, and availability |
| `PUT` | `/api/companions/profile` | Companion | Update bio, hourly rate, services, and weekly availability slots |
| `POST` | `/api/companions/upload-id` | Companion | Upload CNIC/Passport ID verification document (multipart/form-data) |

#### Search Query Parameters:
```text
GET /api/companions?city=Lahore&service=Elderly%20Care&maxPrice=800&minRating=4.5&search=Maryam
```

---

### 4. Bookings (`/api/bookings`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/bookings` | Seeker | Book a companion for care session |
| `GET` | `/api/bookings` | Private | Get user's bookings (filter by `status`) |
| `GET` | `/api/bookings/:id` | Private | Get booking details |
| `PUT` | `/api/bookings/:id/status` | Private | Companion accepts/rejects/completes; Seeker cancels |

#### Example: Create Booking
```json
POST /api/bookings
Authorization: Bearer <ACCESS_TOKEN>
{
  "companionId": "65f1a2b3c4d5e6f7a8b9c0d1",
  "scheduledDate": "2026-10-05T09:00:00.000Z",
  "startTime": "10:00",
  "durationHours": 3,
  "serviceType": "Elderly Care",
  "notes": "Please assist uncle with light garden stroll and blood pressure check.",
  "locationAddress": {
    "street": "House 12, Street 4, Sector F-7",
    "city": "Islamabad",
    "landmark": "Near Super Market"
  },
  "paymentMethod": "cash_on_delivery"
}
```

---

### 5. In-App Chat (`/api/chat`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/chat/conversations` | Private | Get list of user active conversations with unread counter |
| `GET` | `/api/chat/:userId` | Private | Get message history with another user (auto-marks read) |
| `POST` | `/api/chat` | Private | Send text/image/location message (triggers push notification) |

---

### 6. Emergency SOS Alert (`/api/sos`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/sos/trigger` | Seeker | Emergency button: alerts companion, emergency contact, sends GPS |

#### Example: SOS Request
```json
POST /api/sos/trigger
Authorization: Bearer <ACCESS_TOKEN>
{
  "latitude": 31.5204,
  "longitude": 74.3587,
  "address": "Gulberg III, Lahore",
  "customMessage": "Urgent chest discomfort, family notified"
}
```

---

### 7. Reviews & Ratings (`/api/reviews`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/reviews` | Seeker | Submit 1-5 star review after completed booking |
| `GET` | `/api/reviews/companion/:companionProfileId` | Public | Get all reviews for a companion |

---

### 8. Admin Control Panel (`/api/admin`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/admin/dashboard` | Admin | Real-time stats (users, verifications, bookings, revenue) |
| `GET` | `/api/admin/verifications` | Admin | View pending companion ID submissions |
| `PUT` | `/api/admin/verifications/:id` | Admin | Approve or reject companion ID with reason |
| `GET` | `/api/admin/users` | Admin | List all registered users with search & filters |
| `PUT` | `/api/admin/users/:id/toggle-status` | Admin | Ban / activate user account |
| `GET` | `/api/admin/bookings` | Admin | View all bookings across platform |
| `GET` | `/api/admin/reports` | Admin | View user complaints and incident reports |
| `PUT` | `/api/admin/reports/:id` | Admin | Mark report resolved / dismissed |

---

## 🔒 Security Architecture Highlights

1. **Password Hashing**: Uses `bcryptjs` with salt rounds = 10, pre-save hook on Mongoose.
2. **Dual-Token Auth**:
   - Short-lived Access Token (15m expiry) prevents hijacked tokens from long-term abuse.
   - Refresh Token (7d expiry) stored in database and rotated upon issuance.
3. **Helmet & Security Headers**: DNS prefetch control, frameguard, hidePoweredBy.
4. **CORS Flexibility**: Configured to accept mobile apps, Expo Development builds, and web portals without origin restrictions.
5. **Rate Limiting**:
   - Global rate limiter: 150 requests per 15 minutes.
   - Authentication brute-force protection: 20 requests per 15 minutes on `/register` and `/login`.
6. **Input Validation**: Strict `express-validator` sanitation on every route payload.
7. **Mobile Push Notifications**: Integrated with Expo Server SDK to trigger push alerts for incoming bookings, chat messages, and SOS events.

---

## 🔜 Next Steps: Ready for Phase 2
- **Phase 2**: Deploying backend to **Render** Web Service & **MongoDB Atlas** database cluster with persistent live URLs and automatic CI/CD.
