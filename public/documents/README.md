# Documents Folder

This folder contains all PDF documents that will be displayed on the municipality website's Documents page.

## How to Add a New Document

To add a new document to the website, follow these 2 simple steps:

### Step 1: Add the PDF File
Copy your PDF file into this folder (`public/documents/`).

### Step 2: Update the Manifest
Open `manifest.json` and add a new entry to the `documents` array:

```json
{
  "id": "5",
  "title": "Your Document Title (English)",
  "titleAr": "عنوان المستند (بالعربية)",
  "description": "Brief description in English",
  "descriptionAr": "وصف موجز بالعربية",
  "category": "Category Name",
  "categoryAr": "اسم الفئة",
  "icon": "description",
  "filename": "your-file-name.pdf"
}
```

### Icon Options
Common Material Icons you can use:
- `description` - Generic document
- `receipt_long` - Receipts/Financial
- `edit_document` - Forms/Applications
- `gavel` - Legal documents
- `account_balance` - Government/Official
- `assignment` - Reports

### Example
If you add a file called `water-bill-form.pdf`:

```json
{
  "id": "5",
  "title": "Water Bill Payment Form",
  "titleAr": "نموذج دفع فاتورة المياه",
  "description": "Form for water service bill payments",
  "descriptionAr": "نموذج لدفع فواتير خدمة المياه",
  "category": "Utilities",
  "categoryAr": "المرافق",
  "icon": "receipt_long",
  "filename": "water-bill-form.pdf"
}
```

That's it! The document will automatically appear on the website.
