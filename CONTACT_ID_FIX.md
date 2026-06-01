# Contact ID Constraint Fix

## Problem

The application was throwing an error:
```
null value in column "contact_id" of relation "tasks" violates not-null constraint
```

This error occurred when trying to create tasks without specifying a `contact_id`.

## Root Cause

The `tasks` table in the database had a NOT NULL constraint on the `contact_id` column, but the application code treats this field as optional:

```typescript
// In src/lib/tasks.ts
export async function taskOrgCreate(input: {
    // ... other fields
    contactId?: string;  // Optional field
}): Promise<string> {
    const { data, error } = await supabase.rpc('task_org_create', {
        // ... other params
        p_contact_id: input.contactId ?? null,  // Passes null if not provided
    });
    // ...
}
```

## Solution

Run the SQL migration to make the `contact_id` column nullable:

```sql
ALTER TABLE tasks 
ALTER COLUMN contact_id DROP NOT NULL;
```

## How to Apply the Fix

### Option 1: Using Supabase Dashboard
1. Go to your Supabase project dashboard
2. Navigate to the SQL Editor
3. Run the contents of `fix_contact_id_constraint.sql`

### Option 2: Using Supabase CLI
```bash
supabase db push --file fix_contact_id_constraint.sql
```

### Option 3: Direct Database Access
If you have direct database access:
```bash
psql <your-database-url> < fix_contact_id_constraint.sql
```

## Verification

After applying the fix, you should be able to create tasks without providing a `contact_id`:

```typescript
await taskOrgCreate({
    orgId: 'org-123',
    title: 'My Task',
    description: 'Task description',
    // contactId is not required anymore
});
```

## Impact

- **Breaking Change**: No
- **Data Loss**: No
- **Backward Compatible**: Yes
- **Requires Downtime**: No

## Related Files

- `src/lib/tasks.ts` - Task creation logic
- `src/lib/approvals.ts` - Uses contact_id field
- `fix_contact_id_constraint.sql` - Migration file

## Notes

- The `contact_id` field is used to link tasks to contacts in the CRM system
- Not all tasks need to be associated with a contact
- This fix aligns the database schema with the application's business logic
