E-Invoice Microservice

A standalone microservice that connects the ERP system with the Aigentrix E-Invoice platform.

The service handles e-invoice validation, outbound sales invoice submission, inbound supplier invoice synchronisation, provider status tracking, validation errors, and document retrieval.

Invoice Direction
Outbound: The ERP organisation sells to a customer and submits the sales invoice to Aigentrix.
Inbound: A supplier submits an invoice from their system, and the ERP receives it as a purchase invoice.

The same party can act as both a customer and a supplier depending on the transaction.

Basic Flow
ERP Frontend
    ↓
E-Invoice Microservice
    ↓
ERP Backend for verified transaction data
    ↓
Aigentrix E-Invoice API
    ↓
Peppol Network

The microservice keeps Aigentrix credentials and provider-specific logic separate from the ERP frontend and backend.

Main Responsibilities
Validate invoice data
Convert ERP data into Aigentrix format
Submit outbound sales invoices
Receive inbound supplier invoices
Store provider responses and statuses
Return standard responses to the ERP frontend
Prevent duplicate submissions
Maintain submission and status history

Core Principle
ERP Backend owns ERP transactions.
E-Invoice Microservice owns e-invoice integration.
Aigentrix handles provider validation and Peppol processing.
