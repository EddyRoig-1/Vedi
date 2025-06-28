// Smart Email System - One Function, Any Template
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

admin.initializeApp();

// Configure your email transport
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: functions.config().email?.user || 'your-email@gmail.com',
        pass: functions.config().email?.pass || 'your-app-password'
    }
});

// ============================================================================
// SMART TEMPLATE SYSTEM
// ============================================================================

/**
 * Load and render HTML template with data
 * @param {string} templateName - Name of template file (without .html)
 * @param {object} data - Data to inject into template
 * @returns {string} Rendered HTML
 */
function loadTemplate(templateName, data) {
    try {
        const templatePath = path.join(__dirname, 'templates', `${templateName}.html`);
        let html = fs.readFileSync(templatePath, 'utf8');
        
        // Replace placeholders like {{venueName}}, {{restaurantName}}, etc.
        Object.keys(data).forEach(key => {
            const placeholder = new RegExp(`{{${key}}}`, 'g');
            html = html.replace(placeholder, data[key] || '');
        });
        
        return html;
    } catch (error) {
        console.error(`❌ Error loading template ${templateName}:`, error);
        // Fallback to basic HTML if template fails
        return `
            <html>
                <body style="font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5;">
                    <div style="max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px;">
                        <h2 style="color: #333;">Email from ${data.venueName || data.platformName || 'Vedi'}</h2>
                        <p style="color: #666; line-height: 1.6;">${data.message || 'Thank you for using our service!'}</p>
                        <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;">
                        <p style="font-size: 12px; color: #999;">© ${new Date().getFullYear()} Vedi Platform</p>
                    </div>
                </body>
            </html>
        `;
    }
}

/**
 * Get list of available templates
 * @returns {Array} List of template names
 */
function getAvailableTemplates() {
    try {
        const templatesDir = path.join(__dirname, 'templates');
        const files = fs.readdirSync(templatesDir);
        return files
            .filter(file => file.endsWith('.html'))
            .map(file => file.replace('.html', ''));
    } catch (error) {
        console.error('❌ Error reading templates directory:', error);
        return [];
    }
}

// ============================================================================
// ONE SMART EMAIL FUNCTION - HANDLES ANY TEMPLATE
// ============================================================================

/**
 * Universal email function - can send any template
 * Just add HTML files to templates/ folder, no code changes needed!
 */
exports.sendEmail = functions.https.onCall(async (data, context) => {
    try {
        console.log('📧 Attempting to send email with template:', data.template);
        
        const {
            template,           // Template name (e.g., 'welcome', 'invitation', 'booking-confirmation')
            to,                // Recipient email
            subject,           // Email subject
            templateData,      // Data for template placeholders
            requireAuth = true // Whether authentication is required
        } = data;

        // Auth check (can be disabled for welcome emails)
        if (requireAuth && !context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
        }

        // Validate required fields
        if (!template || !to) {
            throw new functions.https.HttpsError('invalid-argument', 'Template and recipient email are required');
        }

        // Check if template exists
        const availableTemplates = getAvailableTemplates();
        if (!availableTemplates.includes(template)) {
            throw new functions.https.HttpsError('not-found', `Template '${template}' not found. Available templates: ${availableTemplates.join(', ')}`);
        }

        // Add common data to template
        const commonData = {
            currentYear: new Date().getFullYear(),
            platformName: 'Vedi',
            supportEmail: functions.config().email?.user || 'support@vediapp.com',
            timestamp: new Date().toLocaleDateString(),
            ...templateData
        };

        // Load and render template
        const emailHtml = loadTemplate(template, commonData);

        // Prepare email options
        const mailOptions = {
            from: `"${templateData?.fromName || 'Vedi Platform'}" <${functions.config().email.user}>`,
            to: to,
            subject: subject || `Email from ${templateData?.fromName || 'Vedi'}`,
            html: emailHtml
        };

        // Send email
        const result = await transporter.sendMail(mailOptions);
        
        console.log(`✅ Email sent successfully using template '${template}' to:`, to);
        console.log('📧 Email result:', result.messageId);
        
        return { 
            success: true, 
            message: `Email sent successfully using template '${template}'`,
            messageId: result.messageId,
            template: template
        };
        
    } catch (error) {
        console.error('❌ Send email error:', error);
        
        return { 
            success: false, 
            error: error.message,
            code: error.code || 'unknown'
        };
    }
});

// ============================================================================
// CONVENIENCE FUNCTIONS (Optional - for common use cases)
// ============================================================================

/**
 * Send welcome email (convenience function)
 */
exports.sendWelcomeEmail = functions.https.onCall(async (data, context) => {
    return exports.sendEmail.handler({
        template: 'welcome',
        to: data.recipientEmail,
        subject: `🎉 Welcome to Vedi, ${data.userName || 'New User'}!`,
        templateData: {
            userName: data.userName,
            userType: data.userType,
            loginLink: 'https://vediapp.com/login',
            dashboardLink: data.userType === 'venue' 
                ? 'https://vediapp.com/venue-dashboard' 
                : 'https://vediapp.com/restaurant-dashboard'
        },
        requireAuth: false // Don't require auth for welcome emails
    }, context);
});

/**
 * Send invitation email (convenience function)
 */
exports.sendInvitationEmail = functions.https.onCall(async (data, context) => {
    // Verify user is a venue manager
    if (context.auth) {
        const userDoc = await admin.firestore().collection('users').doc(context.auth.uid).get();
        const userData = userDoc.data();
        
        if (!userData || userData.accountType !== 'venue') {
            throw new functions.https.HttpsError('permission-denied', 'Must be a venue manager');
        }
    }

    return exports.sendEmail.handler({
        template: 'invitation',
        to: data.to,
        subject: data.subject || `🍽️ You're invited to join ${data.venueName}!`,
        templateData: {
            recipientName: data.recipientName,
            venueName: data.venueName,
            restaurantName: data.restaurantName,
            invitationCode: data.invitationCode,
            invitationLink: data.invitationLink,
            senderName: data.senderName,
            fromName: data.venueName
        },
        requireAuth: true
    }, context);
});

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Test function + list available templates
 */
exports.testFunction = functions.https.onCall(async (data, context) => {
    console.log('🧪 Test function called');
    const availableTemplates = getAvailableTemplates();
    
    return { 
        message: 'Firebase Functions is working!', 
        timestamp: new Date().toISOString(),
        availableTemplates: availableTemplates,
        templateCount: availableTemplates.length,
        emailConfig: {
            user: functions.config().email?.user || 'Not configured',
            configured: !!(functions.config().email?.user && functions.config().email?.pass)
        }
    };
});

/**
 * Clean up expired invitations (Your existing function)
 */
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