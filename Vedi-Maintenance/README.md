# 🍽️ Vedi Maintenance Dashboard

## 📁 Project Structure

```
Vedi-Maintenance/
├── admin-auth.html              ✅ Admin authentication & registration
├── app-admin-dashboard.html     ✅ Main dashboard with analytics
├── maintenance-config.js        ✅ Configuration & utilities
├── maintenance-api.js           ✅ Admin-specific API methods
└── README.md                    ✅ This setup guide
```

## 🚀 Quick Start

### 1. **Initialize Your Firebase Database**

Since your Firestore database isn't set up yet (as shown in your screenshot), follow these steps:

1. **Go to your Firebase Console** → Firestore Database
2. **Click "Start collection"**
3. **Create first collection**: `users`
4. **Add a dummy document** (you can delete it later):
   - Document ID: `dummy`
   - Field: `test` (string) = `"initial"`
5. **Click "Save"** - This activates your database

### 2. **Update Firestore Security Rules**

Go to **Firestore Database** → **Rules** tab and replace with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Admin full access
    match /{document=**} {
      allow read, write: if request.auth != null && 
        exists(/databases/$(database)/documents/adminUsers/$(request.auth.uid));
    }
    
    // Business users access
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    match /restaurants/{restaurantId} {
      allow read, write: if request.auth != null;
    }
    
    match /orders/{orderId} {
      allow read, write: if request.auth != null;
    }
    
    match /menuCategories/{categoryId} {
      allow read, write: if request.auth != null;
    }
    
    match /menuItems/{itemId} {
      allow read, write: if request.auth != null;
    }
    
    match /venues/{venueId} {
      allow read, write: if request.auth != null;
    }
    
    match /lossIncidents/{incidentId} {
      allow read, write: if request.auth != null;
    }
    
    // Public read access for customer features
    match /restaurants/{restaurantId} {
      allow read;
    }
    
    match /menuItems/{itemId} {
      allow read;
    }
    
    match /menuCategories/{categoryId} {
      allow read;
    }
  }
}
```

**Click "Publish"** to activate the rules.

### 3. **Access Your Admin Dashboard**

1. **Open** `admin-auth.html` in your browser
2. **Click** "Need to register as admin? Click here"
3. **Enter your details**:
   - Full Name: `Your Name`
   - Email: `your-email@domain.com`
   - Password: `your-secure-password`
   - **Admin Access Code**: `VEDI2025ADMIN`
4. **Click** "Register as Admin"
5. **You'll be redirected** to the main dashboard

### 4. **Add Your Co-founder**

1. **Share the access code** `VEDI2025ADMIN` with your co-founder
2. **They follow the same registration process**
3. **You can manage admin users** from the admin management section

## 🔐 **Admin Authentication System**

### **How You & Your Co-founder Access It:**

**First Time Setup:**
- Open `admin-auth.html`
- Click "Register as Admin User"
- Enter your details + **Admin Access Code: `VEDI2025ADMIN`**
- Creates your admin account

**Adding Your Co-founder:**
- After you register, the system shows "Admin Management"
- Give your co-founder the access code: `VEDI2025ADMIN`
- They register using the same process
- You can see all admin users and remove access if needed

**Daily Access:**
- Go to `admin-auth.html`
- Login with email/password
- Automatically redirects to `app-admin-dashboard.html`

### **Security Features:**
- ✅ **Secret Access Code** - Only people with `VEDI2025ADMIN` can register
- ✅ **Firebase Authentication** - Secure login system
- ✅ **Admin User Tracking** - Logs who accesses when
- ✅ **Role-based Access** - Only verified admins can access
- ✅ **Session Management** - Automatic login/logout handling

## 📊 **Dashboard Features**

### **1. Overview Dashboard**
- **System Metrics**: Total users, restaurants, orders, API calls
- **Real-time Charts**: User growth, API usage trends
- **Live Activity Feed**: Real-time user actions and system events
- **Growth Analytics**: Week-over-week and month-over-month growth

### **2. API Analytics**
- **Method Tracking**: All 41 VediAPI methods with call counts
- **Performance Metrics**: Response times, error rates per endpoint
- **Usage Patterns**: Peak times, most/least used methods
- **Category Breakdown**: Authentication, Orders, Menu, Real-time, etc.

### **3. User Management**
- **User Overview**: Restaurant owners vs venue managers vs customers
- **Activity Monitoring**: User login patterns, feature usage
- **Growth Tracking**: New signups, retention rates
- **User Distribution**: By account type and activity level

### **4. System Health**
- **Firebase Status**: Firestore reads/writes, authentication health
- **Performance Metrics**: Response times, error rates
- **Health Indicators**: Good/Warning/Critical status levels
- **System Alerts**: Real-time monitoring and notifications

## 🛠 **Technical Implementation**

### **Real-time Data Sources:**
- **User Counts**: Firestore `users` collection
- **Restaurant Data**: Firestore `restaurants` collection  
- **Order Activity**: Firestore `orders` collection
- **Incident Reports**: Firestore `lossIncidents` collection
- **API Analytics**: Firestore `apiCalls` collection (auto-tracked)

### **Analytics Collections Created:**
```javascript
// API call tracking
apiCalls: {
  method: 'signUp',
  responseTime: 120,
  success: true,
  timestamp: serverTimestamp()
}

// Admin access logs
adminLogs: {
  adminId: 'user_123',
  action: 'dashboard_access',
  timestamp: serverTimestamp()
}

// System health monitoring
systemHealth: {
  date: '2025-06-08',
  errorRate: 0.3,
  activeUsers: 150,
  responseTime: 125
}
```

### **Automatic Features:**
- ✅ **Auto-refresh** every 30 seconds
- ✅ **Real-time activity** updates every 10 seconds  
- ✅ **Session management** with timeout handling
- ✅ **Error tracking** and health monitoring
- ✅ **Growth calculations** and trend analysis

## 🔄 **Integration with Existing Vedi System**

### **No Changes Required:**
- Your existing 41 VediAPI methods work unchanged
- All current pages continue functioning normally
- Customer and business user flows unaffected

### **Optional Enhancement:**
Add API call tracking to your existing `firebase-api.js`:

```javascript
// Add this to track API usage (optional)
async function trackAPICall(method, responseTime, success = true) {
  try {
    await firebaseDb.collection('apiCalls').add({
      method,
      responseTime,
      success,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      date: new Date().toISOString().split('T')[0]
    });
  } catch (error) {
    // Silent fail - don't break main functionality
    console.debug('API tracking error:', error);
  }
}
```

## 📈 **What You'll See**

### **Day 1:**
- Basic user counts from your existing data
- System health monitoring
- Admin access tracking
- Mock API analytics (until you add tracking)

### **Week 1:**
- Growth trends as more data accumulates
- Real user activity patterns
- API usage insights
- Performance monitoring

### **Month 1:**
- Comprehensive analytics
- User retention insights  
- System optimization opportunities
- Business intelligence for decision making

## 🎯 **Next Steps**

1. ✅ **Set up Firebase database** (follow steps above)
2. ✅ **Create your admin account** using `VEDI2025ADMIN`
3. ✅ **Add your co-founder** with the same access code
4. ✅ **Explore the dashboard** and familiarize yourself with features
5. 🔄 **Optional**: Add API call tracking for enhanced analytics
6. 📊 **Monitor and optimize** your Vedi platform based on insights

## 🆘 **Troubleshooting**

### **Can't Access Dashboard:**
- Ensure Firebase database is initialized
- Check that security rules are published
- Verify admin access code: `VEDI2025ADMIN`

### **Data Not Loading:**
- Check browser console for errors
- Verify Firebase connection
- Ensure collections exist in Firestore

### **Authentication Issues:**
- Clear browser cache and cookies
- Try incognito/private browsing mode
- Check Firebase Authentication is enabled

---

**🎉 You now have a professional admin dashboard to monitor and manage your entire Vedi restaurant platform!**

The dashboard provides complete visibility into user behavior, system performance, and business metrics to help you make data-driven decisions for growing your platform.
