# Contact Tracker

A private contact-tracking app styled after the provided DJ database reference. It uses dark console-style panels, fixed-height contact cards, avatar support, social-link chips, notes, search, sorting, filtering, and MongoDB persistence.

## Features

- Save contact name, role/title, company/crew, location, email, phone, website, tags, status, priority, notes, and avatar image.
- Save multiple social links using one link per line.
- Search across names, social links, notes, tags, company, location, email, phone, status, and priority.
- Sort by newest, recently updated, name A-Z/Z-A, priority, next follow-up, or oldest.
- Filter by status and priority.
- View, edit, and delete contacts.
- Optional private access token using `ADMIN_TOKEN`.
- Single Railway deployment serves both frontend and backend.

## Stack

- Frontend: HTML, CSS, vanilla JavaScript
- Backend: Node.js, Express
- Database: MongoDB with Mongoose
- Deployment: GitHub repository connected to Railway

## Local setup

```bash
npm install
cp .env.example .env
npm run dev
```

Update `.env` with your MongoDB connection string:

```bash
MONGODB_URI=mongodb://localhost:27017/contact_tracker
ADMIN_TOKEN=your-private-token
DB_NAME=contact_tracker
PORT=3000
```

Open the app at:

```bash
http://localhost:3000
```

## Railway deployment

1. Push this project to a GitHub repository.
2. In Railway, create a new project from the GitHub repository.
3. Add a MongoDB database service to the same Railway project.
4. In the app service variables, set:

```bash
MONGODB_URI=${{ MongoDB.MONGO_URL }}
ADMIN_TOKEN=your-private-token
DB_NAME=contact_tracker
```

Railway will provide `PORT` automatically. The app starts with:

```bash
npm start
```

## Access token behavior

`ADMIN_TOKEN` is optional but recommended. When it is set, the frontend asks for that token and stores it in your browser local storage. Every API request sends it as both a Bearer token and `X-Admin-Token` header.

If `ADMIN_TOKEN` is empty, the app is open to anyone who can access the Railway URL.

## Social link format

Use one social link per line:

```text
Instagram | instagram.com/name
Facebook | facebook.com/name
LinkedIn | linkedin.com/in/name
```

The label is optional. If you only paste a URL, the app tries to infer the label from the domain.

## Avatar storage

Avatars are resized in the browser and saved as image data URLs in MongoDB. This keeps the app simple and avoids needing S3 or another file-storage service.

## Files

```text
client/index.html          App shell and modal markup
client/css/styles.css      Dark DJ-card-inspired UI styling
client/js/app.js           Frontend state, search, sort, CRUD, avatar resizing
server/server.js           Express app, static hosting, MongoDB connection
server/models/Contact.js   Contact schema and search normalization
server/routes/contacts.js  Contact API routes
server/middleware/requireAccess.js Optional token protection
railway.toml               Railway deployment config
.env.example               Environment variable template
```
