#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  GKKS Vivah — a private Gujarati community invite-only matrimonial app.
  Step 3: Registration screen with phone input, MSG91 WhatsApp OTP (placeholder),
  and Cloudflare Turnstile CAPTCHA. Bilingual UI (English/Gujarati).
  Supabase JWT auth on OTP verification.

backend:
  - task: "POST /api/auth/send-otp — Turnstile verify + OTP send via MSG91 (placeholder)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Tested manually. WEB_BYPASS and RESEND_BYPASS tokens allowed. OTP logged to console with placeholder MSG91. Rate limiting (60s) implemented."

  - task: "POST /api/auth/verify-otp — OTP verify + Supabase user create/sign-in"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Tested manually. Creates Supabase auth user, signs in, returns access_token + refresh_token. Also creates public.users record. Confirmed user created in DB."

frontend:
  - task: "Registration screen — phone input + EN/GU language toggle + Turnstile CAPTCHA"
    implemented: true
    working: true
    file: "frontend/app/(auth)/register.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Screenshot confirmed: bilingual toggle works (EN/GU), phone input renders, Turnstile bypass works on web, OTP button enables when phone filled on web."

  - task: "OTP verification screen — 6-cell input, countdown timer, resend, verify"
    implemented: true
    working: "NA"
    file: "frontend/app/(auth)/otp.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Implemented but not yet tested via testing agent."

  - task: "Auth guard — index.tsx redirects to register if no Supabase session"
    implemented: true
    working: "NA"
    file: "frontend/app/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Implemented with supabase.auth.getSession() + onAuthStateChange. Not yet tested end-to-end."

  - task: "Supabase client — SSR-safe initialization (no window crash)"
    implemented: true
    working: true
    file: "frontend/lib/supabase.ts"
    stuck_count: 1
    priority: "high"
    needs_retesting: false
    status_history:
      - working: false
        agent: "main"
        comment: "Initial version caused ReferenceError: window is not defined during Expo Router static rendering."
      - working: true
        agent: "main"
        comment: "Fixed with noopStorage guard: typeof window === 'undefined' check. Static rendering no longer crashes."

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 1
  run_ui: true

test_plan:
  current_focus:
    - "Registration screen — phone input + EN/GU language toggle + Turnstile CAPTCHA"
    - "OTP verification screen — 6-cell input, countdown timer, resend, verify"
    - "Auth guard — index.tsx redirects to register if no Supabase session"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Steps 4 and 5 implementation complete. Testing needed for:

      STEP 4 — ROLE SELECTION:
      1. Register with a NEW phone number (e.g. 9876500000)
      2. After OTP verify, should auto-navigate to /(onboarding)/role-select
      3. Screen shows "I am a Candidate" and "I am a Parent" cards
      4. Tap "I am a Candidate" → should navigate to /(onboarding)/claim-profile
      5. (Optional) Tap "I am a Parent" → should navigate to home screen

      STEP 5 — PROFILE CLAIMING:
      6. On claim-profile screen, type "patel" or "shah" in search
      7. After 400ms debounce, results appear (Raj Patel, Priya Shah, etc.)
         NOTE: Raj Patel is already claimed (pending_approval), Priya Shah and Meera Desai are available
      8. Tap "This is me" on an available profile (Priya Shah or Meera Desai)
      9. Navigate to claim-selfie screen showing profile name
      10. On web: tap selfie box → file picker opens (browser native)
          On mobile: tap selfie box → front camera opens
      11. Select/take photo, preview appears
      12. Tap "Submit Claim" → should succeed and navigate to home
      13. Home screen shows "Profile claim under admin review" badge

      DB VERIFICATION (backend test):
      - profiles table: claimed profile should be status='pending_approval'
      - users table: user should have profile_id set
      - admin_log table: should have profile_claim_submitted event

      Test data:
      - Available profiles: Priya Shah (Ahmedabad), Meera Desai (Vadodara)
      - Already claimed: Raj Patel (Surat) — should show 409 error if selected

      Backend log: /var/log/supervisor/backend.err.log
      App URL: https://vivah-staging.preview.emergentagent.com

  - agent: "main"
    message: |
      Step 6 (Browse Profiles) implementation complete. Testing needed for:

      BROWSE SCREEN:
      1. Login with any phone number (OTP in backend.err.log)
      2. Home screen should have '🔍 Browse Profiles' button
      3. Tap it → navigate to /browse
      4. Browse screen loads and shows 8 profiles immediately (all pending_approval)
      5. Each card shows: name, age, city, gender, M/F badge
      6. Gender filter: tap 'Male' → only 4 males shown; tap 'Female' → only 4 females shown; 'All' → all 8
      7. City filter: type 'Surat' + tap Search → shows Raj Patel and Kavya Joshi
      8. Age filter: type 25 in min, 28 in max + tap Search → shows 5 profiles in age range
      9. Combination filter: Female + City=Surat → shows only Kavya Joshi
      10. Empty result: type 'Bangalore' → shows 'No profiles found. Try different filters.'
      11. Back button returns to home screen

      Backend:
      - GET /api/profiles/browse (no filters) → 8 profiles
      - GET /api/profiles/browse?gender=Female → 4 profiles
      - GET /api/profiles/browse?city=Surat → 2 profiles
      - GET /api/profiles/browse?age_min=25&age_max=28 → 5 profiles

      App URL: https://vivah-staging.preview.emergentagent.com
      1. Register screen: enter phone 9988776655, click security check (web bypass), click 'Send OTP'
      2. OTP screen: OTP is logged to backend stdout as [PLACEHOLDER MSG91] OTP for +91...: XXXXXX.
         Fetch the OTP from backend logs and enter it on OTP screen.
         Backend log location: /var/log/supervisor/backend.err.log
      3. After OTP verify, should redirect to / (home) screen showing "Step 3 Complete"
      4. Home screen shows Sign Out button — verify it redirects back to register screen.
      App URL: https://vivah-staging.preview.emergentagent.com
      No real credentials needed — MSG91 is placeholder (OTP logged to console).
      Cloudflare Turnstile uses WEB_BYPASS on web.
