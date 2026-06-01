# Clear Browser Cache to Apply AI Worker Fix

The AI worker tensor error has been fixed in `worker-v3.js`, but your browser has cached the old version.

## Quick Fix Options:

### Option 1: Hard Refresh (Recommended)
1. Open the tools.html page where IRAB is running
2. Press **Ctrl+Shift+R** (Windows/Linux) or **Cmd+Shift+R** (Mac)
3. This force-reloads all resources including the worker

### Option 2: Clear Cache in DevTools
1. Open DevTools (F12)
2. Right-click the refresh button
3. Select "Empty Cache and Hard Reload"

### Option 3: Clear All Cache
1. Open DevTools (F12)
2. Go to Application tab
3. Click "Clear storage" in the left sidebar
4. Check "Unregister service workers" and "Cache storage"
5. Click "Clear site data"
6. Refresh the page

### Option 4: Incognito/Private Window
1. Open a new Incognito/Private browsing window
2. Navigate to your redglitch ENGINE
3. Test IRAB - it should work now

## What Was Fixed:

**File**: `public/ai/worker-v3.js` (line 17944)
**Issue**: Empty tensors were using plain array `[]` instead of typed array
**Fix**: Changed to `new Float32Array()` for float32 dtype

**File**: `public/ai/irab-assistant-simple.js`
**Enhancement**: Added version-based cache busting to prevent future cache issues

## Verification:

After clearing cache, test IRAB:
1. Open tools.html
2. Ask IRAB a question
3. You should see:
   - ✅ Model loads to 100%
   - ✅ Generation starts
   - ✅ Response is generated without errors
   - ❌ No "Unsupported type for tensor data" error

## Dashboard Enhancements:

Also added AI resource monitoring to project_dashboard.html:
- **AI Memory**: Displays JavaScript heap memory usage
- **AI CPU**: Shows estimated AI workload (0% idle, 70% generating, 85% loading)
- Hover over metrics for detailed status information
