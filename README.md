# 🤖 Facebook to LINE Messenger Bot

State Machine-based bot that bridges Facebook Messenger with LINE Messaging API.

## 📋 Architecture Overview

```
Facebook Page → Messenger Webhook → Node.js Backend (Express)
                                          ↓
                                    Service Layer
                                          ↓
                                      Database
                                          ↓
                                    LINE API
```

## 🛠 Tech Stack

- **Backend**: Node.js + Express.js
- **Database**: MongoDB (Mongoose ODM)
- **APIs**: 
  - Facebook Messenger API
  - LINE Messaging API
- **State Management**: Finite State Machine (FSM)

## 📦 Installation

### 1. Clone or Setup Project

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Required variables:
```env
# Facebook
FB_PAGE_ACCESS_TOKEN=your_token_here
FB_VERIFY_TOKEN=your_token_here
FB_APP_SECRET=your_secret_here

# LINE
LINE_CHANNEL_ACCESS_TOKEN=your_token_here
LINE_CHANNEL_SECRET=your_secret_here

# Database
DATABASE_URL=mongodb+srv://user:pass@cluster.mongodb.net/dbname

# Server
PORT=3000
NODE_ENV=development
```

## 🚀 Getting Started

### Development Mode

```bash
npm run dev
```

Server runs on `http://localhost:3000`

### Production Mode

```bash
npm start
```

## 📁 Project Structure

```
src/
├── app.js                          # Entry point
│
├── config/
│   ├── facebook.config.js         # Facebook API config
│   ├── line.config.js             # LINE API config
│   └── database.config.js          # MongoDB config
│
├── routes/
│   └── webhook.route.js            # Webhook routes
│
├── controllers/
│   └── webhook.controller.js       # Request handlers
│
├── services/
│   ├── messenger.service.js        # Send to Facebook
│   ├── line.service.js             # Send to LINE
│   ├── customer.service.js         # Customer DB ops
│   └── flow.service.js             # ⭐ State Machine Logic
│
├── models/
│   ├── customer.model.js           # Customer schema
│   └── session.model.js            # Session schema
│
├── middlewares/
│   └── verifySignature.js          # Facebook signature verification
│
└── utils/
    ├── logger.js                   # Logging utility
    └── validator.js                # Input validation
```

## 🧠 State Machine Flow

The bot uses a Finite State Machine (FSM) with 4 states:

```
INIT
  ↓ (User sends first message)
WAIT_TYPE_SELECTION
  ↓ (User selects student/business)
WAIT_DETAIL
  ↓ (User provides details)
COMPLETED
  ↓ (Option to reset)
```

### State Descriptions

| State | Description |
|-------|-------------|
| **INIT** | Initial state, show type selection |
| **WAIT_TYPE_SELECTION** | Waiting for user to choose student or business |
| **WAIT_DETAIL** | Waiting for detailed information |
| **COMPLETED** | Information saved, user can reset |

## 🔑 Getting API Credentials

### Facebook
1. Go to [developers.facebook.com](https://developers.facebook.com)
2. Create an app → Select "Messenger"
3. Set up webhook:
   - URL: `https://yourdomain.com/webhook`
   - Verify Token: (create any string)
4. Get Page Access Token
5. Get App Secret from Settings

### LINE
1. Go to [developers.line.biz](https://developers.line.biz)
2. Create a new channel → Messaging API
3. Copy Channel Access Token
4. Copy Channel Secret

### MongoDB
1. Create cluster on [MongoDB Atlas](https://atlas.mongodb.com)
2. Copy connection string: `mongodb+srv://user:pass@cluster.mongodb.net/dbname`

## 📝 Database Models

### Customer Model
```javascript
{
  facebookId: String,
  type: "student" | "real",
  name: String,
  email: String,
  phone: String,
  detail: {
    // Student
    schoolName: String,
    projectTopic: String,
    
    // Business
    businessName: String,
    businessType: String
  },
  lineUserId: String,
  createdAt: Date,
  updatedAt: Date
}
```

### Session Model
```javascript
{
  facebookId: String,
  state: "INIT" | "WAIT_TYPE_SELECTION" | "WAIT_DETAIL" | "COMPLETED",
  tempData: Mixed,
  messageCount: Number,
  expiresAt: Date
}
```

## 🔗 Webhook Setup (Facebook)

1. In your Facebook App → Messenger → Settings:

```
Callback URL: https://yourdomain.com/webhook
Verify Token: (your token from .env)
```

2. Subscribe to these events:
   - `messages`
   - `messaging_postbacks`

## 📤 Sending Messages

### To Facebook
```javascript
await messengerService.sendMessage(recipientId, "Hello!");
await messengerService.sendQuickReply(recipientId, "Choose:", quickReplies);
```

### To LINE
```javascript
const message = lineService.createTextMessage("Hello!");
await lineService.pushMessage(lineUserId, message);
```

## 🧪 Testing

### Test webhook verification
```bash
curl "http://localhost:3000/webhook?hub.verify_token=YOUR_TOKEN&hub.challenge=test123"
```

### Test health check
```bash
curl http://localhost:3000/health
```

### Test sending message (with ngrok)
```bash
ngrok http 3000
# Then update Facebook webhook URL to your ngrok URL
```

## 🚀 Deployment

### Recommended Platforms
- **Backend**: Render, Railway, or VPS
- **Database**: MongoDB Atlas (free tier available)
- **Domain**: Custom domain with Cloudflare

### Deploy Steps
```bash
# Using Render
1. Connect your GitHub repo
2. Set environment variables in Render dashboard
3. Deploy

# Using Railway
1. Connect your GitHub repo
2. Add MongoDB service
3. Set environment variables
4. Deploy
```

## 🔒 Security Checklist

- [ ] Verify X-Hub-Signature from Facebook
- [ ] Never commit `.env` file
- [ ] Use environment variables for secrets
- [ ] Validate user input with constraints
- [ ] Rate limit API calls
- [ ] Use HTTPS for webhook URL

## 📚 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/webhook` | Facebook verification |
| POST | `/webhook` | Receive messages |
| GET | `/health` | Health check |

## 🐛 Troubleshooting

### Webhook not receiving messages
- [ ] Verify Callback URL is correct
- [ ] Check Verify Token in Facebook settings
- [ ] Ensure server is publicly accessible
- [ ] Check server logs

### Database not connecting
- [ ] Verify DATABASE_URL is correct
- [ ] Add IP to MongoDB Atlas whitelist
- [ ] Check network connectivity

### Messages not sending to Facebook
- [ ] Verify FB_PAGE_ACCESS_TOKEN is correct
- [ ] Ensure page access token hasn't expired
- [ ] Check recipient ID is valid

## 📞 Support

For issues or questions, check:
- [Facebook Messenger Docs](https://developers.facebook.com/docs/messenger-platform)
- [LINE Messaging API Docs](https://developers.line.biz/en/docs/messaging-api/)
- [Mongoose Docs](https://mongoosejs.com)

## 📄 License

ISC

---

**Made with ❤️ for Active Income Community**
