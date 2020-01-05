## Certificate Authority (CA)
The authority is the most secure part of the project.
These settings govern and protect the root CA certificates.
Ideally the authority is hosted on a separate machine and network from the Intermediate CA.

### Purposes
- Create self-signed root certificate authority certificate
- Sign requests from intermediate certificate authority
- Notification message to intermediate CA
- Publish signed Certificate Revocation List (CRL)

### Configurable properties
- Country code (e.g. CA)
- State (e.g. Ontario)
- City (e.g. Toronto)
- Organisation (e.g. none)
- Organisational Unit (e.g. none)

### Notification properties
- Notification email(s)
- Notification messaging api to intermediate CA

## Intermediate CA
The intermediate CA signs all of the client and server requests from users.
It is given authority from the root CA, through an active signed intermediate certificate.

### Purposes
- Request new intermediate certificate from root CA
- Upon notification of signed request, activate new intermediate CA certificate
- Keep track of old intermediate CA certificates
- Sign requests from users
- Notification message to users
- Publish signed Certificate Revocation List (CRL)

## Users
Basic user management is required (admin / trustedUsers)
Admin creates and manages accounts for users
