# Troubleshooting Guide

## Installation Issues

### "Cannot find module '@google/generative-ai'"

**Solution:**
```bash
# Delete node_modules and lockfile
rm -rf node_modules package-lock.json

# Reinstall
npm install
```

### "Module not found: Can't resolve '@/components/...'"

**Solution:**
Check that your `tsconfig.json` has the correct paths:
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

## Runtime Errors

### "Gemini API key not configured"

**Solution:**
1. Create `.env.local` file in project root
2. Add: `GEMINI_API_KEY=your_actual_key`
3. Restart the dev server: `npm run dev`
4. Get a key from: https://makersuite.google.com/app/apikey

### "Rate limit exceeded"

**Cause:** You've made more than 20 requests in 1 minute

**Solution:**
- Wait 1 minute for the rate limit to reset
- Clear your browser cookies
- Or increase the limit in `app/api/classify/route.ts`

### "Failed to classify email"

**Possible causes:**
1. Invalid Gemini API key
2. No API quota remaining
3. Network issues

**Solution:**
```bash
# Check if API key is set
echo $GEMINI_API_KEY

# Check server logs in terminal
# Look for error messages

# Test API key with curl
curl -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"Hello"}]}]}'
```

## Build Errors

### "Type error: Cannot find module '@/lib/...'"

**Solution:**
```bash
# Clean Next.js cache
rm -rf .next

# Rebuild
npm run build
```

### "Tailwind CSS not working"

**Solution:**
1. Check `app/globals.css` has `@import 'tailwindcss';`
2. Check `postcss.config.mjs` exists
3. Restart dev server

### "React hydration error"

**Cause:** Server/client mismatch

**Solution:**
- Hard refresh browser (Cmd+Shift+R or Ctrl+Shift+R)
- Clear browser cache
- Check for `suppressHydrationWarning` in layout.tsx

## Development Issues

### Port 3000 already in use

**Solution:**
```bash
# Find process using port 3000
lsof -i :3000

# Kill it
kill -9 <PID>

# Or use different port
PORT=3001 npm run dev
```

### Changes not reflecting

**Solution:**
1. Hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
2. Clear `.next` folder: `rm -rf .next`
3. Restart dev server

### TypeScript errors in components/ui

**Solution:**
The shadcn/ui components should work as-is. If you see errors:
```bash
# Reinstall types
npm install -D @types/node @types/react @types/react-dom

# Check TypeScript version
npm list typescript
```

## API Issues

### Getting empty `labels` array

**Possible causes:**
1. Rules don't match the email content
2. AI is being too conservative

**Solution:**
- Try simpler, more direct rule prompts
- Check the explanations to see why rules didn't match
- Make sure email has actual content (not just empty strings)

### Slow API responses

**Cause:** Gemini API can take 2-5 seconds per rule

**Solution:**
- Use fewer rules (each rule = 1 API call)
- Use simpler rule descriptions
- Consider caching common classifications

## Docker Issues

### "Docker build fails"

**Solution:**
```bash
# Clean Docker cache
docker system prune -a

# Rebuild without cache
docker build --no-cache -t auto-label-email .
```

### "Container exits immediately"

**Solution:**
```bash
# Check logs
docker logs <container_id>

# Make sure .env file is set
# Run with environment variable
docker run -e GEMINI_API_KEY=your_key -p 3000:3000 auto-label-email
```

## Browser Issues

### Demo not loading

**Check:**
1. JavaScript is enabled
2. Browser console for errors (F12)
3. Network tab shows successful requests
4. No ad blockers interfering

### Rate limit headers not showing

**Solution:**
Open browser DevTools (F12) → Network tab → Click on request → Check response headers

### Theme not switching

**Solution:**
- Make sure `theme-provider.tsx` is imported in layout
- Check local storage for `theme` key
- Try clearing browser local storage

## Performance Issues

### Slow page load

**Solutions:**
```bash
# Build for production (much faster)
npm run build
npm start

# Or enable SWC minification
# Already enabled in next.config.mjs
```

### Memory issues

**Solution:**
```bash
# Increase Node memory
NODE_OPTIONS="--max-old-space-size=4096" npm run dev
```

## Getting Help

If none of these solutions work:

1. **Check the logs**
   - Browser console (F12)
   - Terminal where `npm run dev` is running

2. **Verify your setup**
   ```bash
   node --version  # Should be 18+
   npm --version
   cat .env.local  # Should have GEMINI_API_KEY
   ```

3. **Try a clean install**
   ```bash
   rm -rf node_modules .next package-lock.json
   npm install
   npm run dev
   ```

4. **Check the example**
   - Make sure the demo works with example emails
   - If examples work but custom emails don't, issue is with your input

5. **Common mistakes**
   - Forgetting to restart dev server after .env changes
   - Using wrong environment file name (should be `.env.local` not `.env`)
   - API key has spaces or quotes around it
   - Not waiting for rate limit to reset

## Still Need Help?

Check the following files:
- `README.md` - Full documentation
- `GETTING_STARTED.md` - Quick start guide
- `MIGRATION_SUMMARY.md` - Project details

Verify your environment:
```bash
# Run this and share output if asking for help
echo "Node: $(node --version)"
echo "NPM: $(npm --version)"
echo "Next: $(npm list next --depth=0)"
echo "Env file exists: $([ -f .env.local ] && echo 'Yes' || echo 'No')"
echo "API key set: $([ -n "$GEMINI_API_KEY" ] && echo 'Yes' || echo 'No')"
```
