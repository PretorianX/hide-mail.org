# Changelog

All notable changes to this project will be documented in this file.

### Security
- **Fixed critical vulnerabilities in node-forge** (2025-12-04)
  - Updated `node-forge` from 1.3.1 to 1.3.3
  - Fixed ASN.1 Unbounded Recursion vulnerability (High severity)
  - Fixed ASN.1 Validator Desynchronization vulnerability (High severity)
  - Fixed ASN.1 OID Integer Truncation vulnerability (Moderate severity)
  - All three vulnerabilities require node-forge >= 1.3.2, now resolved

