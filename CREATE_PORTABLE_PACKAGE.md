# How to Create a Portable Package for Your Client

## Steps to Create Portable Version (For Developer)

### 1. Build the Application

```bash
npm install
npm run build
```

### 2. Download Portable Node.js

1. Go to: https://nodejs.org/en/download/
2. Download **Windows Binary (.zip)** - 64-bit
3. Extract to a folder named `node-portable`

### 3. Create the Package Structure

Create a folder structure like this:
```
century-portable/
├── node-portable/          (Node.js files)
│   ├── node.exe
│   └── ...
├── app/
│   ├── .next/
│   │   └── standalone/     (from your build)
│   ├── public/
│   ├── .env.local
│   └── START.bat
└── README.txt
```

### 4. Copy Required Files

Copy these to `century-portable/app/`:
- `.next/standalone/*` (entire folder after build)
- `.next/static` → `.next/static`
- `public/` folder
- `.env.local` (template with empty values)
- `START.bat`

### 5. Create START.bat

```batch
@echo off
echo Starting Century Dry Cleaner...
echo.
echo Open browser to: http://localhost:3000
echo.
echo Press Ctrl+C to stop
echo.

cd /d "%~dp0"
..\node-portable\node.exe server.js

pause
```

### 6. Create README.txt

```
CENTURY DRY CLEANER - PORTABLE VERSION
======================================

FIRST TIME SETUP:
1. Edit .env.local file
2. Add your Supabase credentials
3. Save the file

TO RUN:
1. Double-click START.bat
2. Wait for "Ready on http://localhost:3000"
3. Open browser to: http://localhost:3000

TO STOP:
- Close the command window
- Or press Ctrl+C

SUPPORT:
Contact: your-email@example.com
```

### 7. Zip Everything

1. Select the `century-portable` folder
2. Right-click → Send to → Compressed (zipped) folder
3. Name it: `century-dry-cleaner-portable-v1.0.zip`

### 8. Send to Client

Upload to:
- Google Drive
- Dropbox
- WeTransfer
- Or any file sharing service

---

## Alternative: Using Docker (Easier)

### Give Client These Instructions:

1. **Install Docker Desktop**: https://www.docker.com/products/docker-desktop
2. **Download project folder**
3. **Run these commands**:
   ```bash
   cd path\to\century
   docker-compose up -d
   ```
4. **Open**: http://localhost:3000

### Client Benefits:
- ✅ One-time Docker install
- ✅ Easy updates: `docker-compose up -d --build`
- ✅ No conflicts with other software
- ✅ Easy to uninstall

---

## Best Recommendation for Client

### Option A: Cloud Deployment (FREE & EASIEST)

Deploy to Vercel (free):
```bash
# Push your code to GitHub
git push

# Deploy to Vercel
# Visit: https://vercel.com
# Import GitHub repo
# Set environment variables
# Deploy!
```

**Client gets**:
- ✅ URL like: `century-cleaner.vercel.app`
- ✅ Works on any device
- ✅ No installation
- ✅ Automatic updates when you push code
- ✅ Free SSL certificate
- ✅ Mobile friendly

### Option B: Docker (BEST for Local)

If client insists on local:
1. Install Docker Desktop
2. Run docker-compose up -d
3. Done!

---

## Testing Before Sending

1. Test the portable package on a clean Windows machine
2. Make sure .env.local works correctly
3. Verify all features work
4. Check Excel exports work
5. Test on different Windows versions

---

## Troubleshooting

### Port 3000 Already in Use
Edit START.bat:
```batch
set PORT=3001
..\node-portable\node.exe server.js
```

### Missing Dependencies
If errors occur, may need to include node_modules:
- This makes package much larger (200+ MB)
- Better to use Docker instead

### Firewall Issues
Client may need to allow Node.js through Windows Firewall

---

## Updates

When you update the app:
1. Rebuild: `npm run build`
2. Create new portable package
3. Send to client with version number
4. Client replaces app folder, keeps .env.local
