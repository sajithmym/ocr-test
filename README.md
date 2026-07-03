# Invoice OCR Table Test

Open `index.html` in a browser and upload a PDF or image invoice.

## Notes

- Internet is needed because this test uses CDN libraries:
  - PDF.js
  - Tesseract.js
- It works best with clear, high-resolution invoice images.
- OCR may not be 100% perfect. For production invoice table extraction, Google Vision, AWS Textract, or Azure Document Intelligence is more accurate.
