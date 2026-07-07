# Invoice OCR Table Test

Open `index.html` in a browser and upload a PDF or image invoice.

<img width="1920" height="1080" alt="Image" src="https://github.com/user-attachments/assets/a2b5333b-0a39-41e7-88ce-027b67f6bdc9" />

## Notes

- Internet is needed because this test uses CDN libraries:
  - PDF.js
  - Tesseract.js
- It works best with clear, high-resolution invoice images.
- OCR may not be 100% perfect. For production invoice table extraction, Google Vision, AWS Textract, or Azure Document Intelligence is more accurate.
