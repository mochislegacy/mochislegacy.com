# Mochi’s Legacy — Website Editing Guide

Welcome! This website is built with plain, human-readable HTML and CSS—**no build tools, compilers, or coding background required.** All text, photos, and events live inside a single file:

- **`index.html`** — The entire website’s text, photos, and event listings.
- **`assets/images/`** — Folder containing all dog photos and board member portraits.
- **`assets/css/styles.css`** — Colors, fonts, and layout styling (rarely needs changes).

---

## Golden Rule Before You Start

Every editable section in `index.html` is wrapped in clearly marked banner comments that look like this:

```html
<!-- === SECTION: HERO TITLE & MISSION (SAFE TO EDIT TEXT BELOW) === -->
...
<!-- === END SECTION: HERO TITLE & MISSION === -->
```

- **Safe to edit:** Any plain words between `>` and `<` (for example, `<p>Edit this text here</p>`).
- **Do not delete:** The angle-bracket tags themselves (`<div>`, `<p>`, `<h2>`, `<ul>`, `<li>`, `</section>`).

---

## 1. How to Edit Text, Headers, and Bios

1. Open **`index.html`** in any text editor (TextEdit in plain-text mode, Notepad, VS Code, or directly in the GitHub web editor).
2. Press **`Cmd + F`** (Mac) or **`Ctrl + F`** (Windows) and search for `SAFE TO EDIT` or the specific words you want to change.
3. Update the text between the tags and save the file.

### Quick Reference of Editable Sections in `index.html`

| What you want to change | Search for this comment in `index.html` |
| :--- | :--- |
| Main headline & tagline | `SECTION: HERO TITLE & MISSION` |
| Home page Mochi’s story | `SECTION: MOCHI'S STORY & MISSION STATEMENT` |
| Home photo gallery & dog photos | `SECTION: PHOTO GALLERY ITEMS` |
| Dog filter pill buttons | `SECTION: DOG FILTER BUTTONS` |
| Home page event ticket | `SECTION: CURRENT EVENTS` |
| Red / green / gold buttons | `SECTION: CALL-TO-ACTION BUTTONS` |
| Kickoff squad dog names | `SECTION: KICKOFF SQUAD` |
| Events page calendar list | `SECTION: EVENTS PAGE` |
| Photos from previous events | `SECTION: PAST EVENT PHOTOS` |
| About page story & 3 goals | `SECTION: MOCHI'S STORY` |
| About page Mochi photo strip | `SECTION: ABOUT PHOTO GALLERY` |
| About Us vetting steps | `SECTION: HOW VETTING WORKS` |
| Team member names, titles & bios | `SECTION: OUR TEAM PAGE` |
| Footer newsletter & IRS legal text | `SECTION: FOOTER MEMORIAL & LEGAL TEXT` |

### Example: Editing aHeadline or Paragraph

```html
<!-- === SECTION: HERO TITLE & MISSION (SAFE TO EDIT TEXT BELOW) === -->
<div class="landing-intro">
  <h1 tabindex="-1" class="landing-title">Mochi’s Legacy</h1>
  <p class="landing-mission">
    Boulder-area volunteer dogs and handlers sharing comfort and joy.
  </p>
</div>
<!-- === END SECTION: HERO TITLE & MISSION === -->
```

Just replace `Mochi’s Legacy` or `Boulder-area volunteer dogs and handlers sharing comfort and joy.` with your new wording.

---

## 2. How to Add or Remove an Event

Events appear in two places:
1. **Home Page ("Current events" dashed ticket)**
2. **Events Page (`#events` tab)**

### Part A: Adding an Event to the Home Page Ticket

1. Open `index.html` and search for:
   `SECTION: CURRENT EVENTS`
2. Inside `<div class="landing-tickets">`, replace the default `"No upcoming events yet."` ticket (or paste another ticket right below it) using this copy-paste snippet:

```html
<div class="ticket landing-ticket">
  <div class="landing-ticket-detail">
    <p class="landing-event-kind"><span>Gaggle walk</span></p>
    <h3 class="landing-event-title">Saturday Morning Gaggle Walk</h3>
    <p class="landing-event-spot">Pearl Street Mall · Boulder, CO</p>
    <p class="landing-date">May 16 · 10:00 AM – 11:30 AM</p>
  </div>
  <div class="landing-ticket-stub">
    <a href="#events" data-nav="events" class="landing-event-link">
      Event sign-ups
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M5 12h14"></path>
        <path d="m12 5 7 7-7 7"></path>
      </svg>
    </a>
  </div>
</div>
```

### Part B: When No Events Are Scheduled (Resetting to Default)

When an event has passed and no new events are scheduled yet, replace the event ticket inside `<div class="landing-tickets">` with the default empty ticket:

```html
<div class="ticket landing-ticket">
  <div class="landing-ticket-detail">
    <p class="landing-event-title is-empty">
      No upcoming events yet.
    </p>
  </div>
  <div class="landing-ticket-stub">
    <a href="#events" data-nav="events" class="landing-event-link">
      Event sign-ups
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M5 12h14"></path>
        <path d="m12 5 7 7-7 7"></path>
      </svg>
    </a>
  </div>
</div>
```

### Part C: Adding an Event Card on the Events Page

1. Search `index.html` for `SECTION: EVENTS PAGE`.
2. Right below the `<h2>...Coming up</h2>` heading, you can remove (or comment out) `<div class="feature-card events-empty-card">...</div>` and paste one or more event cards:

```html
<article class="event-card">
  <div class="event-card-header">
    <div class="event-date-badge" aria-hidden="true">
      <span class="event-date-month">MAY</span>
      <span class="event-date-day">16</span>
    </div>
    <div class="event-card-info">
      <p class="event-card-kind">Gaggle walk</p>
      <h3 class="event-card-title">Saturday Morning Gaggle Walk</h3>
      <p class="event-card-time">Saturday, May 16 · 10:00 AM – 11:30 AM</p>
    </div>
  </div>
  <p class="event-card-spot">Meet at: Pearl Street Mall, Boulder, CO</p>
  <p class="event-card-notes">Bring water and a standard 6-foot leash.</p>
</article>
```

---

## 3. How to Add a New Photo

### Step 1: Save the Image File
1. Choose your photo (`.webp`, `.jpg`, or `.png` all work).
2. Name the file using lowercase letters, numbers, and hyphens only (no spaces), such as:
   - `honey-1.jpg`
   - `mochi-16.webp`
3. Place the file inside:
   **`assets/images/photos/`**

### Step 2: Add the Photo to the Gallery in `index.html`
1. Open `index.html` and search for:
   `SECTION: PHOTO GALLERY ITEMS`
2. Inside `<ul id="photo-strip-list" class="photo-strip-list" aria-label="Dog photos">`, paste the following block:

```html
<!-- NEW PHOTO -->
<li class="photo-strip-tile" data-dog="Honey">
  <img
    src="assets/images/photos/honey-1.jpg"
    alt="Honey smiling on a sunny trail in Boulder."
    loading="lazy"
  />
</li>
```

3. **Important details:**
   - Set **`data-dog="..."`** to match the exact name on the Dog Filter pill button (`Mochi`, `Honey`, `Luna`, `Mini Mochi`, `Jaz`, or `Bode`).
   - As soon as you add at least one `<li class="photo-strip-tile" data-dog="Honey">`, clicking the **Honey** filter button on the website will automatically display Honey’s photo strip instead of *"Photos of Honey are coming soon."*
   - Set **`alt="..."`** to a short sentence describing the photo for screen-reader users.
   - *(Optional)* If your photo's subject is off-center, you can adjust how it crops inside the rounded tile by adding `style="object-position: 50% 35%"` to the `<img>` tag (the first percentage is horizontal left-to-right `0%`–`100%`; the second is vertical top-to-bottom `0%`–`100%`).

### Adding or Updating a Team Member Portrait & Bio
1. Place the square portrait image inside **`assets/images/board/`** (for example, `assets/images/board/jane-doe.webp`).
2. Search `index.html` for `SECTION: OUR TEAM PAGE` and copy-paste a `<li class="board-card">...</li>` block:

```html
<li class="board-card">
  <div class="board-photo-wrap">
    <img
      src="assets/images/board/jane-doe.webp"
      alt="Photo of Jane Doe"
      width="400"
      height="400"
      loading="lazy"
      decoding="async"
      class="board-photo"
    />
  </div>
  <div class="board-content">
    <div class="board-header">
      <h3 class="board-name">Jane Doe</h3>
      <div class="board-role-row">
        <span class="board-role">Team Member</span>
        <span class="board-dot" aria-hidden="true">·</span>
        <span class="board-dog-title">Chief Belly-Rub Officer</span>
      </div>
    </div>
    <div class="board-bio">
      <p>Write Jane’s first bio paragraph here.</p>
      <p>Write Jane’s second bio paragraph here.</p>
    </div>
  </div>
</li>
```

---

### Adding Photos to "Photos from Previous Events"
1. Place your event photo inside **`assets/images/photos/`** (e.g., `event-gaggle-1.jpg`).
2. Search `index.html` for `SECTION: PAST EVENT PHOTOS`.
3. If this is the first photo:
   - Add `hidden` to the placeholder: `<div id="events-past-photos-empty" ... hidden>`.
   - Remove `hidden` from the gallery container: `<div id="events-past-photo-strip" class="photo-strip events-photos" ...>`.
4. Inside `<ul id="events-past-photo-list" class="photo-strip-list">`, paste:

```html
<li class="photo-strip-tile">
  <img
    src="assets/images/photos/event-gaggle-1.jpg"
    alt="Golden Retrievers walking together on Pearl Street Mall."
    loading="lazy"
    decoding="async"
    draggable="false"
  />
</li>
```

---

## 4. Admin Dashboard Guide & Supabase Setup

The website includes a modern, zero-dependency **Admin Dashboard** designed for founders and event coordinators. It allows you to:
1. **Review & delete submissions** for *"I have a dog"* and *"I want to volunteer"*.
2. **Add & delete events**, dynamically updating the Home page ticket and Events page in real time.
3. **View email subscribers** with a 1-click **"Copy all emails for BCC"** button for easy newsletters.
4. **Issue new admin keys** and, for the Super Admin, view and revoke any issued key.

---

### Step 1: One-Time Supabase Database Setup

To enable live cross-device database syncing, run the migration script once in your Supabase project:

1. Open your Supabase Dashboard:
   [https://supabase.com/dashboard/project/reaejdpsapuvuquxfvip/sql/new](https://supabase.com/dashboard/project/reaejdpsapuvuquxfvip/sql/new)
2. Open the file **`new_web/supabase/admin_setup.sql`** in any text editor, select all text, and copy it.
   *(Alternatively, log into the Admin Dashboard and click the **"Copy SQL Script"** button on the top banner).*
3. Paste the entire SQL script into the Supabase SQL Editor and click **Run**.
4. The script creates the secure `mochi_admin_keys` table, installs the `mochi_k_*` server-side security functions, and creates the first Super Admin key.

---

### Step 2: Accessing the Admin Dashboard

There are two easy ways to access the admin portal:

#### Option A: Direct Magic Link (Recommended)
Open your personal `#k=...` link in any browser (desktop or mobile phone). The browser will securely save your key in local storage so you stay logged in.
Links are personal and are never written in this repository. Ask the Super Admin for yours.

#### Option B: Sign-in Gate
1. Click the **Admin** link in the top navigation bar (or navigate to `/#admin`).
2. Paste your 32-character key or your full `#k=...` link into the input box.
3. Click **Open Admin Dashboard**.

---

### Step 3: Using the Admin Dashboard Features

#### 1. Submissions Tab (*"I have a dog"* & *"I want to volunteer"*)
- Use the **All**, **Dogs**, and **Volunteers** filter pills at the top to focus on specific submissions.
- Each dog submission card displays the dog's name, breed, age, city, owner contact info, and special notes.
- Each volunteer submission card displays the person's name, email, selected skills (e.g., Photography, Event coordination), and interest notes.
- **Deleting a submission:** Click the red **Delete** button on any card. An inline confirmation bar will appear asking *"Are you sure you want to delete [Name]?"*. Click **"Yes, delete"** to confirm, or **"Cancel"** to abort.

#### 2. Events Tab (Add & Delete Events)
- Click **"+ Add New Event"** to expand the event creator form.
- Fill out:
  - **Event Title** (e.g., *Saturday Morning Gaggle Walk*)
  - **Event Type** (e.g., *Gaggle walk*, *Training*, *Social*)
  - **Date** (e.g., *2026-05-16*)
  - **Start & End Time** in Mountain Time (e.g., *10:00 AM* to *11:30 AM*)
  - **Meeting Spot** (e.g., *Pearl Street Mall · Boulder, CO*)
  - **Dog Capacity** (e.g., *15*)
  - **Notes / Instructions** (e.g., *Bring water and standard 6ft leash.*)
- Click **"Publish Event"**.
  - The event is immediately saved to the database.
  - The Home page dashed ticket updates automatically.
  - The Events page (`#events`) displays the new event card with date badge and details.
- **Deleting an event:** Click **"Delete"** next to any event in the list and confirm. It is immediately unpublished from both the Home page and Events page.

#### 3. Email List Tab (Newsletter Subscribers & One-Click BCC)
- Displays all visitors who submitted the *"Keep me posted"* newsletter form.
- Click **"Copy all emails for BCC"**. All email addresses are copied to your clipboard formatted as:
  `user1@gmail.com, user2@yahoo.com, user3@outlook.com`
- Open Gmail or your email app, start a new email, click **BCC**, and press **Cmd + V** (Mac) or **Ctrl + V** (Windows) to paste the entire list.
- You can also click **"Remove"** on any individual subscriber to delete them from the list.

#### 4. Admin Keys Tab (Issuing & Revoking Access)
- **Your Personal Link:** Click **"Copy Link"** to copy your own login link so you can bookmark it or email it to your phone.
- **Generate a New Key:**
  1. Under *"Issue a New Admin Key"*, enter the team member's name and optional email.
  2. Click **"Generate Admin Link"**.
  3. A new 32-character key and full `#k=...` magic link will be created. Click **"Copy Link"** to send it to the new coordinator.
- **Super Admin Management (Nolan Bonnie only):**
  - Displays every issued admin key, who it belongs to, and when it was created.
  - To revoke access for a lost link or departing volunteer, click **"Revoke"** next to their key and confirm. The key will immediately stop working.
  - Super Admin keys cannot be revoked.

