// Updated for deployment
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

admin.initializeApp();

// Configure your email transport - FIXED: createTransport not createTransporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: functions.config().email?.user || 'your-email@gmail.com',
        pass: functions.config().email?.pass || 'your-app-password'
    }
});

// Send invitation email function
exports.sendInvitationEmail = functions.https.onCall(async (data, context) => {
    try {
        console.log('📧 Attempting to send invitation email...');
        
        // Verify the request is from an authenticated user
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
        }
        
        // Verify user is a venue manager
        const userDoc = await admin.firestore().collection('users').doc(context.auth.uid).get();
        const userData = userDoc.data();
        
        if (!userData || userData.accountType !== 'venue') {
            throw new functions.https.HttpsError('permission-denied', 'Must be a venue manager');
        }
        
        // Prepare email options
        const mailOptions = {
            from: `"Vedi Platform" <noreply@vedi.com>`,
            to: data.to,
            subject: data.subject,
            html: data.html
        };
        
        // Send email
        const result = await transporter.sendMail(mailOptions);
        
        console.log('✅ Invitation email sent successfully to:', data.to);
        console.log('📧 Email result:', result.messageId);
        
        return { 
            success: true, 
            message: 'Email sent successfully',
            messageId: result.messageId 
        };
        
    } catch (error) {
        console.error('❌ Send email error:', error);
        
        // Return a more detailed error for debugging
        return { 
            success: false, 
            error: error.message,
            code: error.code || 'unknown'
        };
    }
});

// Test function to verify deployment works
exports.testFunction = functions.https.onCall(async (data, context) => {
    console.log('🧪 Test function called');
    return { message: 'Firebase Functions is working!', timestamp: new Date().toISOString() };
});

// Optional: Clean up expired invitations
exports.cleanupExpiredInvitations = functions.pubsub.schedule('every 24 hours').onRun(async (context) => {
    try {
        const now = admin.firestore.Timestamp.now();
        const expiredQuery = admin.firestore()
            .collection('venueInvitations')
            .where('status', '==', 'pending')
            .where('expiresAt', '<', now);
        
        const expiredDocs = await expiredQuery.get();
        
        if (expiredDocs.empty) {
            console.log('No expired invitations found');
            return null;
        }
        
        const batch = admin.firestore().batch();
        
        expiredDocs.forEach(doc => {
            batch.update(doc.ref, { status: 'expired' });
        });
        
        await batch.commit();
        
        console.log(`✅ Marked ${expiredDocs.size} invitations as expired`);
        
        return { processed: expiredDocs.size };
        
    } catch (error) {
        console.error('❌ Cleanup error:', error);
        return null;
    }
});