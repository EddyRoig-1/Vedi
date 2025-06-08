# 🍽️ Vedi - Complete Restaurant Management Platform

[![Firebase](https://img.shields.io/badge/Firebase-9.23.0-orange)](https://firebase.google.com/)
[![Status](https://img.shields.io/badge/Status-Production%20Ready-brightgreen)](https://github.com)
[![License](https://img.shields.io/badge/License-Private-red)](LICENSE)

> **Enterprise-grade restaurant management system with real-time ordering, venue management, loss tracking, and comprehensive admin monitoring.**

---

## 📋 Table of Contents

- [🎯 Overview](#-overview)
- [✨ Features](#-features)
- [🏗️ Architecture](#️-architecture)
- [🚀 Quick Start](#-quick-start)
- [📁 Project Structure](#-project-structure)
- [🔌 API Reference](#-api-reference)
- [👥 User Roles](#-user-roles)
- [🔐 Security](#-security)
- [📊 Analytics](#-analytics)
- [🛠️ Development](#️-development)
- [📱 Mobile Support](#-mobile-support)
- [🧪 Testing](#-testing)
- [🚢 Deployment](#-deployment)
- [📞 Support](#-support)

---

## 🎯 Overview

**Vedi** is a comprehensive restaurant management platform built with Firebase, offering seamless customer ordering, restaurant operations management, multi-venue oversight, and enterprise-level monitoring capabilities.

### **🎯 Mission**
Transform restaurant operations with technology that enhances customer experience while providing powerful management tools for restaurant owners and venue operators.

### **💼 Built For**
- **Independent Restaurants** - Complete ordering and management system
- **Multi-Restaurant Venues** - Centralized oversight and analytics
- **Food Courts** - Unified customer experience across vendors
- **Enterprise Operations** - Advanced monitoring and business intelligence

---

## ✨ Features

### 🍽️ **Customer Experience**
- **QR Code Ordering** - Instant menu access without app downloads
- **Phone-Based Identity** - Seamless recognition across visits
- **Real-Time Tracking** - Live order status with notifications
- **Order History** - Complete purchase history across restaurants
- **Restaurant Discovery** - Browse and filter local dining options

### 🏪 **Restaurant Management**
- **Real-Time Orders** - Live order processing and status updates
- **Dynamic Menus** - Instant menu updates and stock management
- **QR Code Generation** - Custom codes for customer table access
- **Analytics Dashboard** - Order trends and performance insights
- **Loss Incident Tracking** - Comprehensive incident reporting system

### 🏢 **Venue Operations**
- **Multi-Restaurant Dashboard** - Centralized management interface
- **Cross-Restaurant Analytics** - Performance insights across venues
- **Multi-Currency Support** - Handle different restaurant currencies
- **Venue-Wide Monitoring** - Real-time oversight of all operations
- **Restaurant Onboarding** - Streamlined invitation and setup process

### 🔧 **Enterprise Admin**
- **Platform Monitoring** - Complete system health oversight
- **API Analytics** - Performance tracking for all 41 API methods
- **User Management** - Platform-wide user administration
- **Business Intelligence** - Growth metrics and engagement analytics
- **System Alerts** - Proactive monitoring with notifications

---

## 🏗️ Architecture

### **Frontend Architecture**
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Customer UI   │    │   Business UI    │    │   Admin UI      │
│                 │    │                  │    │                 │
│ • QR Scanning   │    │ • Order Mgmt     │    │ • Analytics     │
│ • Menu Browsing │    │ • Menu Control   │    │ • User Mgmt     │
│ • Order Tracking│    │ • Analytics      │    │ • Monitoring    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌──────────────────┐
                    │   VediAPI Layer  │
                    │   (41 Methods)   │
                    └──────────────────┘
                                 │
                    ┌──────────────────┐
                    │ Firebase Backend │
                    │                  │
                    │ • Firestore DB   │
                    │ • Authentication │
                    │ • Real-time      │
                    │ • Analytics      │
                    └──────────────────┘
```

### **Database Schema**
```
Firestore Collections:
├── users                 - User accounts and profiles
├── restaurants          - Restaurant information and settings
├── venues               - Venue data and configuration
├── menuCategories       - Menu category organization
├── menuItems           - Menu items with pricing and availability
├── orders              - Order data with real-time status tracking
├── lossIncidents       - Loss tracking and incident management
├── adminUsers          - Admin access management
├── adminLogs           - Admin action logging
├── apiCalls            - API usage tracking and analytics
├── systemHealth        - Performance monitoring data
└── systemErrors        - Error tracking and debugging
```

---

## 🚀 Quick Start

### **Prerequisites**
- Modern web browser (Chrome, Firefox, Safari, Edge)
- Firebase project with Firestore enabled
- Web server or hosting platform

### **Installation**

1. **Clone the Repository**
   ```bash
   git clone https://github.com/yourusername/vedi.git
   cd vedi
   ```

2. **Firebase Setup**
   ```bash
   # Install Firebase CLI (if needed)
   npm install -g firebase-tools
   
   # Login to Firebase
   firebase login
   
   # Initialize project
   firebase init
   ```

3. **Configure Firebase**
   - Update `firebase-config.js` with your Firebase configuration
   - Deploy Firestore security rules from the repository
   - Enable Authentication (Email/Password)

4. **Deploy**
   ```bash
   # Deploy to Firebase Hosting
   firebase deploy
   
   # Or use any web server
   python -m http.server 8000  # Python
   npx serve .                 # Node.js
   ```

### **First-Time Setup**

1. **Initialize Database**
   - Visit Firebase Console → Firestore Database
   - Create database in production mode
   - Database collections will auto-create on first use

2. **Create Admin Account**
   - Navigate to `/Vedi-Maintenance/admin-auth.html`
   - Register with access code: `VEDI2025ADMIN`
   - Access admin dashboard for system monitoring

3. **Add First Restaurant**
   - Visit `/Landing-Signup-Login/signup.html`
   - Create restaurant owner account
   - Complete restaurant setup wizard

---

## 📁 Project Structure

```
Vedi/
├── 📄 index.html                     # Main landing page
├── ⚙️ firebase-config.js             # Firebase configuration
├── 🔌 firebase-api.js                # Complete API layer (41 methods)
│
├── 👥 Customer/                      # Customer-facing interface
│   ├── checkout.html                 # Order placement and payment
│   ├── customer-orders.html          # Order history and tracking
│   ├── directory.html                # Restaurant discovery
│   ├── customer-login.html           # QR code entry system
│   ├── menu.html                     # Interactive menu viewing
│   └── order-progress.html           # Real-time order tracking
│
├── 🚪 Landing-Signup-Login/          # Authentication system
│   ├── landing.html                  # Marketing landing page
│   ├── login.html                    # Unified business login
│   ├── signup.html                   # Business registration
│   ├── restaurant-setup.html         # Restaurant onboarding
│   └── venue-setup.html              # Venue creation process
│
├── 🏪 Owner/                         # Restaurant management
│   ├── dashboard.html                # Restaurant control panel
│   ├── incident-reports.html         # Loss tracking system
│   ├── orders.html                   # Order management interface
│   ├── qr-generator.html             # QR code generation
│   └── restaurant-settings.html      # Restaurant configuration
│
├── 🏢 Venue-Manager/                 # Multi-restaurant management
│   ├── data-quality.html             # Data monitoring and validation
│   ├── detailed-reports.html         # Analytics and insights
│   ├── loss-tracking.html            # Incident oversight
│   ├── overview.html                 # Venue dashboard
│   ├── performance.html              # Performance metrics
│   ├── venue-admin-dashboard.html    # Multi-currency dashboard
│   ├── venue-invitation.html         # Restaurant invitations
│   └── venue-management.html         # Venue administration
│
└── 🔧 Vedi-Maintenance/              # Enterprise admin system
    ├── admin-auth.html               # Secure admin authentication
    ├── app-admin-dashboard.html      # Real-time monitoring dashboard
    ├── maintenance-config.js         # Admin configuration
    ├── maintenance-api.js            # Analytics API (20+ methods)
    └── README.md                     # Admin setup guide
```

---

## 🔌 API Reference

### **VediAPI - Complete Backend (41 Methods)**

#### **Authentication (6 methods)**
```javascript
// User registration
await VediAPI.signUp(email, password, userData);

// User login
await VediAPI.signIn(email, password);

// Get current user
const user = await VediAPI.getCurrentUser();

// Check email availability
const exists = await VediAPI.checkEmailExists(email);
```

#### **Restaurant Management (5 methods)**
```javascript
// Create restaurant
const restaurant = await VediAPI.createRestaurant(restaurantData);

// Get owner's restaurant
const restaurant = await VediAPI.getRestaurantByOwner(userId);

// Update restaurant
await VediAPI.updateRestaurant(restaurantId, updates);
```

#### **Menu Management (12 methods)**
```javascript
// Get complete menu
const menu = await VediAPI.getFullMenu(restaurantId);

// Create menu item
const item = await VediAPI.createMenuItem(itemData);

// Update stock status
await VediAPI.updateItemStock(itemId, inStock);

// Search menu items
const results = await VediAPI.searchMenuItems(restaurantId, term);
```

#### **Order Management (7 methods)**
```javascript
// Create order
const order = await VediAPI.createOrder(orderData);

// Get customer's active order
const activeOrder = await VediAPI.getMostRecentActiveOrder(phone);

// Update order status
await VediAPI.updateOrderStatus(orderId, status, estimatedTime);
```

#### **Real-time Features (7 methods)**
```javascript
// Listen to order updates
const unsubscribe = VediAPI.listenToOrders(restaurantId, (orders) => {
    updateOrdersDisplay(orders);
});

// Track specific order
VediAPI.listenToOrder(orderId, (order) => {
    updateOrderStatus(order);
});
```

#### **Venue Management (4 methods)**
```javascript
// Create venue
const venue = await VediAPI.createVenue(venueData);

// Get venue restaurants
const restaurants = await VediAPI.getRestaurantsByVenue(venueId);
```

#### **Loss Tracking (8 methods)**
```javascript
// Report incident
const incident = await VediAPI.createLossIncident(incidentData);

// Get analytics
const analytics = await VediAPI.getLossAnalytics(restaurantId, 'month');
```

---

## 👥 User Roles

### **🔵 Customers**
- **Access Method**: QR code scanning
- **Permissions**: View menus, place orders, track order status
- **Data**: Identified by phone number, order history preserved

### **🟡 Restaurant Owners**
- **Access Method**: Email/password authentication
- **Permissions**: Manage own restaurant, process orders, update menus
- **Features**: Order management, menu control, analytics, loss reporting

### **🟠 Venue Managers**
- **Access Method**: Email/password authentication
- **Permissions**: Oversee multiple restaurants, venue-wide analytics
- **Features**: Multi-restaurant dashboard, performance monitoring, incident oversight

### **🔴 System Administrators**
- **Access Method**: Secure access code + authentication
- **Permissions**: Platform-wide monitoring, user management, system analytics
- **Features**: Complete system oversight, API monitoring, business intelligence

---

## 🔐 Security

### **Authentication & Authorization**
```javascript
// Multi-level security rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Admin full access
    match /{document=**} {
      allow read, write: if isAdmin();
    }
    
    // Business user access
    match /restaurants/{restaurantId} {
      allow read, write: if isOwner(resource.data.ownerUserId);
    }
    
    // Public menu access
    match /menuItems/{itemId} {
      allow read: if true;
    }
  }
}
```

### **Data Protection**
- **Role-based Access Control** - Firestore security rules
- **Data Isolation** - Restaurant data separated by ownership
- **Admin Separation** - Admin collections isolated from business data
- **Customer Privacy** - No personal data storage, phone-based identification only

### **Session Management**
- **Automatic Timeouts** - Sessions expire after inactivity
- **Secure Tokens** - Firebase authentication tokens
- **Admin Logging** - All admin actions logged with timestamps

---

## 📊 Analytics

### **Business Intelligence**
- **Order Analytics** - Volume, trends, peak times
- **Revenue Tracking** - Daily, weekly, monthly reports
- **Customer Insights** - Return rates, order patterns
- **Menu Performance** - Popular items, category analysis

### **System Monitoring**
- **API Performance** - Response times, error rates for all 41 methods
- **User Activity** - Login patterns, feature usage
- **System Health** - Firebase quotas, database performance
- **Error Tracking** - Automated error detection and reporting

### **Real-time Dashboards**
- **Live Metrics** - Current orders, active users, system status
- **Interactive Charts** - User growth, API usage trends
- **Alert System** - Critical errors, performance issues
- **Activity Feeds** - Real-time user actions across platform

---

## 🛠️ Development

### **Development Setup**
```bash
# Clone repository
git clone https://github.com/yourusername/vedi.git
cd vedi

# Set up local development server
python -m http.server 8000
# or
npx serve .

# Access development environment
open http://localhost:8000
```

### **Environment Configuration**
```javascript
// Development environment
const isDevelopment = window.location.hostname === 'localhost';

// Use emulators in development
if (isDevelopment) {
    firebase.firestore().useEmulator('localhost', 8080);
    firebase.auth().useEmulator('http://localhost:9099');
}
```

### **Code Standards**
- **ES6+ JavaScript** - Modern JavaScript features
- **Modular Architecture** - Separated concerns and clean APIs
- **Error Handling** - Comprehensive try-catch blocks
- **Loading States** - User feedback during operations
- **Responsive Design** - Mobile-first approach

---

## 📱 Mobile Support

### **Responsive Design**
- **Mobile-First** - Optimized for smartphone usage
- **Touch-Friendly** - Large buttons, easy navigation
- **Fast Loading** - Optimized assets and lazy loading
- **Offline Capability** - Firebase offline persistence

### **QR Code Integration**
- **Native Camera** - Built-in QR code scanning
- **Fallback Options** - Manual entry for accessibility
- **Deep Linking** - Direct menu access via QR codes

---

## 🧪 Testing

### **Testing Strategy**
```javascript
// User flow testing
const testCustomerOrder = async () => {
    // 1. QR code entry
    await simulateQRScan(restaurantId);
    
    // 2. Menu browsing
    const menu = await VediAPI.getFullMenu(restaurantId);
    
    // 3. Order placement
    const order = await VediAPI.createOrder(orderData);
    
    // 4. Status tracking
    VediAPI.listenToOrder(order.id, updateCallback);
};
```

### **Firebase Emulator Testing**
```bash
# Start Firebase emulators
firebase emulators:start

# Run tests against local emulators
npm test
```

---

## 🚢 Deployment

### **Firebase Hosting**
```bash
# Build and deploy
firebase deploy

# Deploy specific services
firebase deploy --only hosting
firebase deploy --only firestore:rules
```

### **Custom Hosting**
```bash
# Build static files
npm run build

# Deploy to your hosting provider
rsync -av build/ user@server:/var/www/vedi/
```

### **Environment Variables**
```javascript
// Production configuration
const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    // ... other config
};
```

---

## 📞 Support

### **Documentation**
- **API Reference** - Complete method documentation
- **Setup Guides** - Step-by-step installation
- **User Manuals** - Role-specific usage guides
- **Admin Docs** - System monitoring and management

### **Getting Help**
- **GitHub Issues** - Bug reports and feature requests
- **Documentation** - Comprehensive guides and tutorials
- **Community** - Developer community and discussions

### **Maintenance**
- **Regular Updates** - Security patches and feature updates
- **Monitoring** - 24/7 system health monitoring
- **Backup** - Automated Firebase backups
- **Support** - Technical support for critical issues

---

## 📄 License

This project is proprietary and confidential. All rights reserved.

---

## 🏆 Acknowledgments

Built with ❤️ using:
- [Firebase](https://firebase.google.com/) - Backend infrastructure
- [Chart.js](https://www.chartjs.org/) - Analytics visualization
- [Modern Web Standards](https://developer.mozilla.org/) - Progressive web technologies

---

**🍽️ Vedi - Transforming Restaurant Operations, One Order at a Time**

*Ready for production deployment with enterprise-grade monitoring and analytics.*
