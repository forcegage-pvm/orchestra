/**
 * Copy Templates to Extension Bundle
 *
 * This script copies the templates directory (containing .hbs files)
 * from the extension's templates/ directory into the extension's dist/templates/
 * directory, ensuring templates are available at runtime.
 */

const fs = require("fs");
const path = require("path");

// Paths relative to extension directory
const SOURCE_DIR = path.resolve(__dirname, "../templates");
const TARGET_DIR = path.resolve(__dirname, "../dist/templates");

function copyDirectory(src, dest) {
  // Ensure destination directory exists
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  // Read source directory
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      // Recursively copy subdirectories
      copyDirectory(srcPath, destPath);
    } else {
      // Copy file
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function main() {
  console.log("📦 Copying templates to extension bundle...");
  console.log(`   Source: ${SOURCE_DIR}`);
  console.log(`   Target: ${TARGET_DIR}`);

  // Check if source directory exists
  if (!fs.existsSync(SOURCE_DIR)) {
    console.error("❌ Error: Templates directory not found at", SOURCE_DIR);
    process.exit(1);
  }

  // Copy templates
  copyDirectory(SOURCE_DIR, TARGET_DIR);

  console.log("✅ Templates copied successfully!");
}

main();
