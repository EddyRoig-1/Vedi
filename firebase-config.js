// firebase-config.js - Your Actual Vedi Configuration
const firebaseConfig = {
    apiKey: "AIzaSyDglG7Soj0eKu2SLoVby6n71S7gcQzHBPg",
    authDomain: "vedi00.firebaseapp.com",
    projectId: "vedi00",
    storageBucket: "vedi00.firebasestorage.app",
    messagingSenderId: "136867441640",
    appId: "1:136867441640:web:9ec709b63f5690f628125d",
    measurementId: "G-ZS0FKPTEY2"
};

// Initialize Firebase for Vedi
firebase.initializeApp(firebaseConfig);

// Initialize services
const auth = firebase.auth();
const db = firebase.firestore();
const analytics = firebase.analytics();

// Make available globally for Vedi app
window.firebaseAuth = auth;
window.firebaseDb = db;
window.firebaseAnalytics = analytics;

console.log('🍽️ Vedi Firebase initialized successfully');
console.log('📊 Analytics tracking enabled');