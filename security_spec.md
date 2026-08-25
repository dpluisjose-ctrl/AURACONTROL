# Security Spec: Billetera Virtual - Control de Cuentas

This document outlines the validation rules, data invariants, and potential attack vectors ("Dirty Dozen" payloads) for the database of this application.

## 1. Data Invariants

Since this application utilizes Firestore for multi-user profile synchronization and lacks backend authentication barriers (instead managing identities locally), we enforce structural/schema constraints on the public paths to ensure no invalid, malformed, or hostile payloads can be written.

*   **Users (`/users/{userId}`)**:
    *   `id` must match the path variable `{userId}` exactly.
    *   `username` must be a string of length between 3 and 50 characters.
    *   `email` must be a string containing `@`.
    *   `passwordHash` must be a valid base64-like hash.
    *   `avatar` must be a short string (typically an emoji, <= 10 chars).
    *   `createdAt` must be a parseable timestamp.

*   **Accounts (`/users/{userId}/accounts/{accountId}`)**:
    *   `id` must match the path variable `{accountId}` exactly.
    *   `name` must be a string of length between 1 and 100 characters.
    *   `type` must be one of `debit`, `credit`, `savings`, `cash`.
    *   `balance` must be a valid number.
    *   `limit` must be a valid number.
    *   `theme` must be a string of length <= 30.
    *   `number` must be a string of length <= 10.
    *   `bank` must be a string of length <= 100.
    *   `currency` must be either `USD` or `VES`.

*   **Transactions (`/users/{userId}/transactions/{transactionId}`)**:
    *   `id` must match the path variable `{transactionId}` exactly.
    *   `accountId` must be a valid alphanumeric ID.
    *   `amount` must be a positive/valid number.
    *   `type` must be one of `income`, `expense`, `transfer`.
    *   `category` must be a valid string of length <= 50.
    *   `date` must be a valid date format.
    *   `description` must be a string of length <= 500.

*   **Debts (`/users/{userId}/debts/{debtId}`)**:
    *   `id` must match the path variable `{debtId}` exactly.
    *   `type` must be `to_pay` or `to_collect`.
    *   `person` must be a string of length between 1 and 100 characters.
    *   `amount` must be a valid number.
    *   `currency` must be `USD` or `VES`.
    *   `status` must be `pending` or `paid`.

*   **Past Savings (`/users/{userId}/pastSavings/{savingId}`)**:
    *   `id` must match the path variable `{savingId}` exactly.
    *   `month` must be a valid month representation.
    *   `amountUSD` and `amountVES` must be numbers.

---

## 2. The "Dirty Dozen" Payloads (Vulnerable / Malformed Entries)

Here are twelve payloads designed to test our rules by trying to bypass constraints. All of these must be rejected by `firestore.rules`.

### Payload 1: ID Mismatch Attack (Users)
Attacker tries to inject a document with a mismatched inner ID.
```json
// Path: /users/usr-12345
{
  "id": "usr-99999",
  "username": "attacker",
  "email": "attacker@gmail.com",
  "passwordHash": "c2VjdXJlX3Bhc3N3b3JkX2hhc2g=",
  "avatar": "🦁",
  "createdAt": "2026-05-23T19:17:43Z"
}
```

### Payload 2: Hostile Size Overrun (Users)
Spammer attempts to bloat database storage by inserting a massive username.
```json
// Path: /users/usr-12345
{
  "id": "usr-12345",
  "username": "A_VERY_LONG_STRING_REPEATED_OVER_AND_OVER_THAT_EXCEEDS_50_CHARACTERS_FOR_RESOURCE_EXHAUSTION_ATTEMPTS",
  "email": "user@gmail.com",
  "passwordHash": "c2VjdXJlX2hhc2g=",
  "avatar": "🦁",
  "createdAt": "2026-05-23T19:17:43Z"
}
```

### Payload 3: Invalid Email Pattern (Users)
Registering a client with an invalid email structure (no `@` symbol).
```json
// Path: /users/usr-12345
{
  "id": "usr-12345",
  "username": "user123",
  "email": "invalid_email_format.com",
  "passwordHash": "c2VjdXJlX2hhc2g=",
  "avatar": "🦁",
  "createdAt": "2026-05-23T19:17:43Z"
}
```

### Payload 4: Invalid Account Type (Accounts)
Attacking by pushing an unsupported account type of "malicious_type".
```json
// Path: /users/usr-12345/accounts/acc-555
{
  "id": "acc-555",
  "name": "My Account",
  "type": "malicious_type",
  "balance": 100,
  "limit": 0,
  "theme": "indigo",
  "number": "1234",
  "bank": "Banesco",
  "currency": "USD"
}
```

### Payload 5: Type Poisoning (Accounts)
Inserting non-numeric balance values to crash frontend computations.
```json
// Path: /users/usr-12345/accounts/acc-555
{
  "id": "acc-555",
  "name": "My Account",
  "type": "debit",
  "balance": "One Hundred Dollars",
  "limit": 0,
  "theme": "indigo",
  "number": "1234",
  "bank": "Banesco",
  "currency": "USD"
}
```

### Payload 6: Mismatched Account ID in Subcollection (Accounts)
Path ID mismatch.
```json
// Path: /users/usr-12345/accounts/acc-555
{
  "id": "acc-999",
  "name": "Ghost Account",
  "type": "debit",
  "balance": 0,
  "limit": 0,
  "theme": "indigo",
  "number": "1234",
  "bank": "Banesco",
  "currency": "USD"
}
```

### Payload 7: Mismatched Currency (Accounts)
Using random symbols in `currency` to break multi-currency calculations.
```json
// Path: /users/usr-12345/accounts/acc-555
{
  "id": "acc-555",
  "name": "My Account",
  "type": "debit",
  "balance": 0,
  "limit": 0,
  "theme": "indigo",
  "number": "1234",
  "bank": "Banesco",
  "currency": "EUR"
}
```

### Payload 8: Transaction State Bypass / Type Leak (Transactions)
Invalid transaction type classification outside of defined list.
```json
// Path: /users/usr-12345/transactions/tx-111
{
  "id": "tx-111",
  "accountId": "acc-555",
  "amount": 250,
  "type": "refund",
  "category": "comida",
  "date": "2026-05-23",
  "description": "Ghost write"
}
```

### Payload 9: Invalid Amount Type (Transactions)
Injecting a non-number type value as `amount` in transactions.
```json
// Path: /users/usr-12345/transactions/tx-111
{
  "id": "tx-111",
  "accountId": "acc-555",
  "amount": "mucha-plata",
  "type": "expense",
  "category": "comida",
  "date": "2026-05-23",
  "description": "Bugged amount"
}
```

### Payload 10: Debt Target Shortcutting (Debts)
Inserting an invalid enum value for Debt Status.
```json
// Path: /users/usr-12345/debts/d-888
{
  "id": "d-888",
  "type": "to_pay",
  "person": "John Doe",
  "amount": 50,
  "currency": "USD",
  "status": "forgiven_status"
}
```

### Payload 11: Past Saving String Poisoning (PastSavings)
Spamming month representations with ultra huge names.
```json
// Path: /users/usr-12345/pastSavings/s-222
{
  "id": "s-222",
  "month": "SuperLongMonthNameThatIsMalformedAndHostileFromAnAttackerPerspective",
  "amountUSD": 100,
  "amountVES": 3600,
  "date": "2026-05-23T19:17:43Z"
}
```

### Payload 12: Phantom Keys Injection
Attempting a "Shadow Update" by introducing unexpected/ghost fields.
```json
// Path: /users/usr-12345/accounts/acc-555
{
  "id": "acc-555",
  "name": "My Account",
  "type": "debit",
  "balance": 100,
  "limit": 0,
  "theme": "indigo",
  "number": "1234",
  "bank": "Banesco",
  "currency": "USD",
  "isVerifiedUser": true
}
```

---

## 3. Test Verification Plan

All of these payloads will be rejected by our secure `firestore.rules` containing explicit Schema Validation Helpers for all write operations.
