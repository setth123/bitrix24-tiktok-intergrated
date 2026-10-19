# NestJS 12 là ESM-only; Jest chỉ load được nó từ Node 24.9.
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>24||(a===24&&b>=9)?0:1)" || {
  echo "❌ Cần Node >= 24.9 để chạy test (đang dùng $(node -v))."
  echo "   Cài đặt: nvm install 24 && nvm use   (repo có sẵn .nvmrc)"
  exit 1
}
