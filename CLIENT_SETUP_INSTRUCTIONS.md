# Century Dry Cleaner - Client Setup Instructions

## For Clients Without npm/Node.js Installed

You have **3 options** to run this application locally:

---

## ✅ OPTION 1: Docker (RECOMMENDED - Easiest)

### What you need:
- Docker Desktop (free download)

### Steps:

1. **Download and Install Docker Desktop**
   - Windows: https://www.docker.com/products/docker-desktop
   - Install and restart your computer
   
2. **Get the Application Files**
   - Download the complete project folder
   - Extract to: `C:\century-dry-cleaner`

3. **Configure Database**
   - Open the `.env.local` file
   - Add your Supabase credentials:
     ```
     NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
     NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_key
     ```

4. **Run the Application**
   - Open Command Prompt or PowerShell
   - Navigate to the folder:
     ```
     cd C:\century-dry-cleaner
     ```
   - Start the app:
     ```
     docker-compose up -d
     ```

5. **Access the Application**
   - Open your browser
   - Go to: **http://localhost:3000**

### To Stop the Application:
```bash
docker-compose down
```

### To Update the Application:
```bash
docker-compose down
docker-compose up -d --build
```

---

## ✅ OPTION 2: Portable Node.js (No Installation Required)

### What you need:
- Portable Node.js (we'll provide)
- Pre-built application files

### Steps:

1. **Get the Portable Package**
   - Download `century-portable.zip` (we'll create this for you)
   - Extract to: `C:\century-dry-cleaner`

2. **Configure Database**
   - Edit `.env.local` with your Supabase credentials

3. **Run the Application**
   - Double-click `START.bat`
   - Wait for "Ready on http://localhost:3000"

4. **Access the Application**
   - Browser will open automatically
   - Or go to: **http://localhost:3000**

### To Stop:
- Close the command window
- Or press `Ctrl+C` in the window

---

## ✅ OPTION 3: Cloud Deployment (Access from Anywhere)

We can deploy this to the cloud (Vercel/Netlify) for free:

### Benefits:
- ✅ No installation needed
- ✅ Access from any device
- ✅ Automatic updates
- ✅ Always online
- ✅ Secure HTTPS

### Steps:
1. We deploy to cloud
2. You get a URL like: `https://century-cleaner.vercel.app`
3. Access from any browser, any device
4. Works on phones and tablets too!

---

## 📋 Which Option Should I Choose?

### Choose **DOCKER** if:
- ✅ You want full local control
- ✅ You have stable internet (for initial download)
- ✅ You're comfortable with basic commands

### Choose **PORTABLE** if:
- ✅ You want the simplest setup
- ✅ You want to run on USB drive
- ✅ You need to move between computers

### Choose **CLOUD** if:
- ✅ You want zero maintenance
- ✅ You need mobile access
- ✅ You want automatic backups
- ✅ Multiple locations/staff access

---

## 🆘 Need Help?

Contact your developer with:
- Screenshot of any errors
- Which option you chose
- Your Windows version

## 📱 After Setup

1. **First Login**: Use phone number as password
2. **Setup Database**: Follow the setup wizard
3. **Create First Invoice**: Test the system
4. **Generate Reports**: Try daily/weekly reports
5. **Export Excel**: Download your first report

---

## 🔒 Security Notes

- Keep `.env.local` file secure (contains database keys)
- Use strong passwords for Supabase
- Regular backups recommended
- Don't share database credentials

## 💾 Data Storage

Your data is stored in Supabase cloud database:
- Automatic backups
- Accessible from any device (if cloud deployed)
- Secure and encrypted
- No data lost if computer crashes
