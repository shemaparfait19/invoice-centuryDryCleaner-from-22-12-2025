# Custom Date Range Feature Added

## What's New

Users can now generate reports for **any custom date range** by selecting:
- **From Date** (start date)
- **To Date** (end date)

This gives complete flexibility beyond the preset periods (Daily, Weekly, Monthly, Yearly).

---

## Where to Find It

### **For Regular Users**
1. Go to **Reports** section
2. Select **"Custom Range"** from the period dropdown
3. Two date pickers appear:
   - **Start Date** field
   - **To** label
   - **End Date** field
4. Select your dates
5. Report updates automatically
6. Click **"Export Excel"** to download

### **For Admins**
1. Go to **Admin → Reports**
2. Click **"Custom Range"** button
3. A card appears with:
   - **From Date** picker
   - **To Date** picker
4. Select your dates
5. Data loads automatically
6. Click **"Download Excel"** to export

---

## How It Works

### Date Range Selection
```
Example: From 01/01/2025 to 31/01/2025
Shows: All invoices created between these dates (inclusive)
```

### Features
- ✅ Start date defaults to 7 days ago
- ✅ End date defaults to today
- ✅ Includes entire end date (23:59:59)
- ✅ Updates automatically when dates change
- ✅ Works with all report features
- ✅ Excel export includes date range in filename

---

## Excel Export Format

### Filename Example
```
century-report-custom-2025-01-01_to_2025-01-31.xlsx
```

### Report Contents
Same comprehensive format as other periods:

**Sheet 1: Report**
- Date
- Name
- Tel Number
- Address
- Service Description
- Quantity
- Unit Price
- Item Total
- Invoice Total
- Paid/Not Paid
- Payment Method
- Status (Completed/Pending)
- Pickup Date
- Pickup Time
- Invoice ID
- Notes

**Sheet 2: Summary**
- Total Revenue
- Total Paid
- Total Invoices
- Completed/Pending/Cancelled counts
- Payment methods breakdown

---

## Use Cases

### 1. Monthly Financial Reports
```
From: 01/10/2025
To:   31/10/2025
→ Get complete October financials
```

### 2. Quarter Reports
```
From: 01/01/2025
To:   31/03/2025
→ Q1 2025 report
```

### 3. Special Promotions
```
From: 15/12/2024
To:   05/01/2025
→ Holiday season analysis
```

### 4. Specific Week
```
From: 20/10/2025
To:   26/10/2025
→ Specific week performance
```

### 5. Year-to-Date
```
From: 01/01/2025
To:   Today
→ All invoices this year
```

---

## Technical Details

### Files Modified
1. `components/advanced-reports.tsx`
   - Added custom date range state
   - Updated filtering logic
   - Added date range UI
   - Updated export filename

2. `app/admin/reports/page.tsx`
   - Added custom date range state
   - Updated Supabase query with date filters
   - Added date range UI card
   - Updated export filename

### Date Handling
- Start date: 00:00:00 (beginning of day)
- End date: 23:59:59 (end of day)
- Timezone: Local browser timezone
- Format: YYYY-MM-DD (ISO standard)

---

## Available Report Periods

Now you have **5 options**:

1. **Daily** - Single day
2. **Weekly** - Monday to Sunday
3. **Monthly** - Full calendar month
4. **Yearly** - Full year
5. **Custom Range** ⭐ NEW! - Any dates you want

---

## Benefits

✅ **Flexible** - Pick any date range  
✅ **Accurate** - Includes full start and end days  
✅ **Easy** - Simple date picker interface  
✅ **Fast** - Instant updates  
✅ **Professional** - Clean Excel exports  
✅ **Historical** - Access any past period  
✅ **Planning** - Compare different periods  

---

## Testing

### To Test Locally
1. Start dev server: `npm run dev`
2. Go to Reports
3. Select "Custom Range"
4. Choose dates
5. Verify data shows correctly
6. Export to Excel
7. Open Excel file and verify

### Test Scenarios
- [ ] Same day (start = end)
- [ ] One week range
- [ ] One month range
- [ ] Multiple months
- [ ] Full year
- [ ] Cross-year range
- [ ] Future dates (should show empty)
- [ ] Very old dates
- [ ] Export Excel with each range

---

## Future Enhancements

Possible additions:
- Quick buttons: "Last 7 days", "Last 30 days", "Last 90 days"
- Calendar popup with visual date selection
- Save favorite date ranges
- Compare two different periods
- Email scheduled reports
- PDF export option

---

## Support

If date range doesn't work:
1. Check start date is before end date
2. Refresh browser (Ctrl + Shift + R)
3. Clear browser cache
4. Check console for errors
5. Verify Supabase connection
