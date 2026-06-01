# Org Panel Refresh Fix

## Problem
When refreshing any page in the org panel (`/org/*` routes), the user was being taken out of the org scope and seeing the message "No active organisation selected. Use the workspace switcher in the top right."

## Root Cause
The scope restoration logic in `ScopeContext.tsx` was not considering the current route when restoring the user's scope after a page refresh. This caused a race condition where:
1. Page loads and renders with default `PERSONAL_SCOPE`
2. Scope restoration effect runs later and tries to restore saved scope
3. But by then, the page has already rendered with the wrong scope

## Solution

### 1. Route-Aware Scope Restoration (`src/context/ScopeContext.tsx`)
- Added `getCurrentPath()` helper function to detect current route
- Enhanced scope restoration logic to check if user is on an `/org/*` route
- If on org route during restoration, **prioritize org scope** regardless of saved preference
- Ensures that refreshing on any org page keeps you in org scope

### 2. Fixed Loading State Management
- Changed initial `loading` state from `false` to `true`
- Only set `loading` to `false` after scope is fully restored
- This ensures `scopeLoading` in `ProtectedRoute` accurately reflects restoration status
- Prevents premature rendering before scope is set

### 3. Removed Duplicate Code
- Fixed syntax error where catch block code was duplicated
- Cleaned up the restoration effect to be more maintainable

### 4. Improved Scope Switcher Navigation (`src/layouts/AdminLayout.tsx`)
- Enhanced scope switcher to intelligently navigate when switching scopes:
  - Switching to Platform/Personal from org route → navigate to `/dashboard`
  - Switching to Org from non-org route → navigate to `/org/dashboard`
  - Switching between orgs while on org route → stay on current org route
- Closes scope menu after selection for better UX

### 5. Simplified ProtectedRoute (`src/App.tsx`)
- Removed redundant scope-route alignment effect (now handled in ScopeContext)
- Cleaner separation of concerns

## Key Changes

### `src/context/ScopeContext.tsx`
```typescript
// Added route detection
function getCurrentPath(): string {
    return typeof window !== 'undefined' ? window.location.pathname : '';
}

// Enhanced restoration logic
const currentPath = getCurrentPath();
const isOnOrgRoute = currentPath.startsWith('/org/');

// CRITICAL: If user is on an org route, ensure we're in org scope
if (isOnOrgRoute) {
    // Try to restore saved org or use first available org
    const firstOrg = memberships.find((m) => m.status === 'active');
    if (firstOrg) {
        setScope(buildOrgScope(firstOrg));
        // ... set loading false and return
    }
}
```

### `src/layouts/AdminLayout.tsx`
```typescript
// Smart navigation when switching scopes
onClick={() => { 
    switchToOrg(m.org_id); 
    setScopeMenuOpen(false);
    // Navigate to org dashboard if not already on org route
    if (!location.pathname.startsWith('/org/')) {
        navigate('/org/dashboard');
    }
}}
```

## Testing Checklist
- [x] Refresh on `/org/dashboard` → stays on org dashboard
- [x] Refresh on `/org/members` → stays on members page with org scope
- [x] Refresh on `/org/requests` → stays on requests page with org scope
- [x] Switch from platform to org → navigates to org dashboard
- [x] Switch from org to platform → navigates to platform dashboard
- [x] Switch between different orgs → maintains current route if applicable
- [x] No TypeScript compilation errors

## Files Modified
1. `src/context/ScopeContext.tsx` - Route-aware scope restoration
2. `src/layouts/AdminLayout.tsx` - Smart scope switcher navigation
3. `src/App.tsx` - Simplified ProtectedRoute

## Result
✅ Refreshing on any org panel page now maintains the correct scope and route
✅ Seamless switching between platform and org panels
✅ No weird navigation issues or flashing
✅ Proper loading states prevent premature rendering
