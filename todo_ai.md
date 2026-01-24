# TODO - Auto Label Email Project

## 🎯 High Priority

### Stripe Integration
- [ ] Complete Stripe integration for subscription management
- [ ] Test Stripe integration with test Stripe account
- [ ] Store user spreadsheet URL and refresh token in Stripe customer metadata
- [ ] Implement webhook handling for subscription events

### Infrastructure & Reliability
- [ ] Add health check endpoint (`/api/health`)
- [ ] Add health check to Docker configuration
- [ ] Add retry logic to frontend API calls
- [ ] Add retry logic to backend API calls (Gemini, Gmail, etc.)
- [ ] Implement proper error handling and logging (add sentry)

---

## 🎨 Frontend Improvements

### Interactive Demo
- [ ] Fix font on demo homepage
- [ ] Update labels on the left to display as proper labels (not just text)
- [ ] Make config box wider for better UX
- [ ] Replace "X" button with trash can icon for removing rows
- [ ] Remove "no database needed" cell or redesign to 3 cells
- [ ] Update GitHub link in footer/components

### Testing & Demo Features
- [ ] Update frontend to support tests
- [ ] Add more test emails to demo
- [ ] Add buttons to dynamically add more test emails
- [ ] Add a "wild" test email example for edge cases

### Deterministic Rules Display
- [ ] Surface deterministic rules to the frontend
- [ ] Display deterministic rule results in the demo interface
- [ ] Show which deterministic rules matched for each email

---

## 🔍 Deterministic Rules

### Domain Validation Rules
- [ ] **Domain Down Check**: Make HTTP/HTTPS GET request to sender domain
  - If request fails → label as `domain-down`
  - This should be a separate deterministic rule
- [ ] **Domain Redirects Check**: Check if domain redirects to different domain
  - If redirects to different domain (not just subdomain) → label as `domain-redirects`
  - This should be a separate deterministic rule from domain-down

### SMTP Provider Detection
- [ ] **Gmail SMTP**: Detect if email uses Gmail SMTP via MX lookup → label as `smtp-gmail`
- [ ] **Microsoft SMTP**: Detect if email uses Microsoft SMTP via MX lookup → label as `smtp-msft`
- [ ] **Work Email SMTP**: Detect if email uses other work email providers (Zoho, etc.) via MX lookup → label as `smtp-work-email`
- [ ] **Automation Platform SMTP**: Detect if email uses automation platforms (AWS SES, SendGrid, etc.) via MX lookup → label as `smtp-automation`

### Unsubscribe Detection
- [ ] **Unsubscribe Links**: Add deterministic rule to detect unsubscribe links in emails
  - Already implemented as `Has-Unsubscribe` - verify it's working correctly

### Additional Rules
- [ ] Add more deterministic rules (as needed)
- [ ] Implement rule enable/disable functionality via Google Sheets (columns G:H for binary yes/no)

---

## 📊 Google Sheets Integration

### Configuration Management
- [ ] Store user spreadsheet URL in Stripe customer metadata
- [ ] Store refresh token in Stripe customer metadata
- [ ] Implement automatic refresh token management
- [ ] Add support for enabling/disabling automation rules via Google Sheets (columns G:H)

---

## 📈 Analytics & Monitoring

### Usage Tracking
- [ ] Add usage analytics tracking
- [ ] Track usage metrics (emails processed, API calls, etc.)
- [ ] **Important**: Do NOT log email contents for privacy
- [ ] Store analytics data (consider database or analytics service)

---

## 🧪 Testing & Quality

### Test Coverage
- [ ] Add frontend tests for interactive demo
- [ ] Add integration tests for email processing
- [ ] Test deterministic rules with various email scenarios
- [ ] Test Stripe webhook handling

---

## 📝 Documentation

### Updates Needed
- [ ] Update README with new features
- [ ] Document deterministic rules in README
- [ ] Document Stripe integration setup
- [ ] Add examples for new features

---

## 🔧 Technical Debt

### Code Quality
- [ ] Review and refactor deterministic rules code
- [ ] Optimize API calls (batch requests where possible)
- [ ] Improve error messages and user feedback
- [ ] Add TypeScript strict mode compliance

---

## 📌 Notes

- Deterministic rules should work alongside AI rules
- All deterministic rules should return results even when not matched (for transparency)
- Consider caching MX lookups and domain checks to reduce API calls
- Ensure all new features respect user privacy (no email content logging)
