import fs from 'fs';
import markdownit from 'markdown-it';
import HTMLtoDOCX from 'html-to-docx';

const md = markdownit();

const markdownContent = `
# Project Report: RBMI Admission Hub CRM vs. Meritto Platform

**Date:** June 18, 2026
**Prepared For:** RBMI Administration

---

## 1. Executive Summary
This document provides a comprehensive analysis of the **RBMI Admission Hub (RBMI CRM)** currently under development, benchmarking it against the industry-standard **Meritto (formerly NoPaperForms)** platform. The report outlines the completed modules, remaining tasks, and details the role-based workflows and operational capabilities for Admins, Counselors, and Students.

---

## 2. Platform Progress: Completed vs. Remaining

### 2.1 Completed Features (Meritto Equivalents Achieved)
The current implementation successfully covers the core functionalities of an enrollment automation platform:

*   **Robust Data Architecture & Security:** Integrated with Supabase, featuring comprehensive Row Level Security (RLS) for multi-tenant data protection.
*   **Multi-Role Authentication:** Secure access control for Admins, Counselors, and Students.
*   **Centralized Lead Management:** APIs and UI for capturing, tracking, updating, and importing leads in bulk.
*   **Dynamic Pipeline Management:** Visual tracking of lead journeys from Enquiry to Admission.
*   **Task & Activity Tracking:** Follow-up scheduling, automated reminders, and chronological activity logging per lead.
*   **Student Application Portal:** A dedicated, self-serve portal for students to track application status, upload documents, and view fee structures.
*   **Multi-channel Communication Framework:** Backend integrations for Twilio (WhatsApp/SMS) and Nodemailer (Email) with template support.
*   **Form Builder Engine:** Capability to design custom, dynamic lead capture forms for external websites.
*   **Marketing & Campaign Management:** UTM parameter tracking to measure campaign ROI and lead sources.
*   **AI Integration Framework:** Setup for 'Asha AI' using OpenAI to assist counselors with lead intelligence.
*   **Reporting & Analytics:** Advanced reporting dashboards tracking counselor performance, conversion rates, and lead distribution.
*   **Payment Gateway Readiness:** Infrastructure for online fee collection and invoice tracking.

### 2.2 Remaining Features (Advanced Meritto Capabilities)
To achieve full feature parity with Meritto's premium enterprise tier, the following advanced features are pending or require expansion:

*   **Visual Workflow Automation Builder:** A drag-and-drop interface for creating complex, multi-step marketing and nurturing automations (currently handled via basic triggers and code logic).
*   **Native Mobile Applications:** Dedicated iOS and Android apps for on-the-go access for both counselors and students.
*   **Built-in Cloud Telephony UI:** While Twilio APIs are integrated, a full browser-based dialer interface with live call recording and pop-ups needs further frontend polishing.
*   **Deep ERP Integrations:** Two-way, real-time syncing capabilities with enterprise ERP systems (e.g., SAP, TCS iON) for post-admission academic lifecycle management.
*   **Advanced Custom Formula Reports:** A self-service BI tool allowing admins to create complex, formula-based custom reports without developer assistance.

---

## 3. Role-Based Workflows & Operations

The platform is strictly segregated by user roles, ensuring secure and focused operational environments.

### 3.1 Administrator (Admin) Workflow
The Admin acts as the system orchestrator, maintaining global oversight and configuration.

**Key Operations & Capabilities:**
*   **System Configuration:** Manage institute settings, course catalogs, batches, and fee structures.
*   **User & Access Management:** Create counselor profiles, assign roles, and map counselors to specific branches or departments.
*   **Lead Distribution:** Configure logic for auto-assigning incoming leads based on source, course preference, or branch.
*   **Marketing Operations:** Generate UTM links, manage advertising campaigns, and monitor overall marketing spend vs. conversion ROI.
*   **Form Management:** Use the Form Builder to create, edit, and publish custom inquiry forms.
*   **Macro Analytics:** Access global dashboards to review admission targets, revenue metrics, and evaluate overall counselor performance.

### 3.2 Counselor Workflow
Counselors are the primary operators, focused on lead nurturing and conversion.

**Key Operations & Capabilities:**
*   **Lead Nurturing (Pipeline):** View assigned leads and manually advance them through custom pipeline stages (e.g., New -> Contacted -> Form Filled -> Admitted).
*   **Task Management:** Schedule follow-up calls, zoom interviews, and set reminders to ensure zero lead leakage.
*   **Communication:** Trigger direct WhatsApp messages, SMS, or Emails from the lead's profile using predefined templates.
*   **Application & Document Verification:** Review uploaded student documents, approve or reject them, and trigger missing document reminders.
*   **Lead Intelligence:** Utilize the AI module to gauge Student Quality Index (SQI) and prioritize high-intent leads.
*   **Personal Dashboard:** Track personal conversion targets, pending daily tasks, and call logs.

### 3.3 Student (User) Workflow
The Student workflow is designed to provide a frictionless applicant experience.

**Key Operations & Capabilities:**
*   **Initial Engagement:** Interact with public-facing lead capture forms on the institute's main website or landing pages.
*   **Portal Access:** Log into a personalized Student Portal using secure authentication.
*   **Application Management:** Fill out detailed admission forms and track their real-time approval status.
*   **Document Uploads:** Securely upload required KYC and academic documents.
*   **Payments:** View due fees and process secure online payments (e.g., Application Fee, Semester Fee).
*   **Query Resolution:** Raise support tickets or queries directly to the admissions team and track responses.

---

## 4. Conclusion
The RBMI Admission Hub has successfully implemented the foundational and intermediate layers of a robust Enrollment Management System comparable to Meritto. The core modules for Lead Management, Counselor Operations, and Student Portals are functional and well-structured. Future iterations should focus on advanced automation UI and mobile accessibility to fully match Meritto's enterprise ecosystem.
`;

const htmlContent = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body { font-family: 'Calibri', 'Arial', sans-serif; line-height: 1.6; color: #333; }
  h1 { color: #2c3e50; text-align: center; border-bottom: 2px solid #3498db; padding-bottom: 10px; }
  h2 { color: #2980b9; margin-top: 25px; border-bottom: 1px solid #eee; padding-bottom: 5px; }
  h3 { color: #16a085; margin-top: 20px; }
  p { margin-bottom: 15px; }
  ul { margin-bottom: 15px; }
  li { margin-bottom: 8px; }
  strong { color: #2c3e50; }
</style>
</head>
<body>
${md.render(markdownContent)}
</body>
</html>
`;

async function generateDocx() {
  try {
    const fileBuffer = await HTMLtoDOCX(htmlContent, null, {
      table: { row: { cantSplit: true } },
      footer: true,
      pageNumber: true,
    });
    
    fs.writeFileSync('RBMI_CRM_vs_Meritto_Detailed_Report.docx', fileBuffer);
    console.log('Successfully generated RBMI_CRM_vs_Meritto_Detailed_Report.docx');
  } catch (error) {
    console.error('Error generating document:', error);
  }
}

generateDocx();
