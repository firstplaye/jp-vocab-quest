import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // 使用相对路径, 这样部署到 GitHub Pages 的子路径(/仓库名/)也能正常加载资源
  base: './',
  plugins: [vue()],
})
