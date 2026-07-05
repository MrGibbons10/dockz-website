# Setting up payments on your Dockz site — baby steps

No coding, no terminal — just clicking through websites. Should take about
20 minutes. Do the steps in order.

You'll need: the `dockz_site_stripe` folder I sent you (unzipped on your
computer), an email address, and your Stripe login.

---

## PART 1 — Put your files somewhere Vercel can see them

### Step 1: Unzip the folder
Find the `dockz_site_stripe.zip` file I sent you and double-click it (or
right-click → Extract) so you have a normal folder called `dockz_site_stripe`
on your computer with these things inside it: `index.html`, an `api` folder,
and a couple of other small files.

### Step 2: Make a free GitHub account
1. Go to **github.com**
2. Click **Sign up** (top right)
3. Enter your email, make a password, pick a username
4. Follow the on-screen steps to verify your email

*(GitHub is just a place to store your website's files online — think of it
like Google Drive for code. Vercel will read from here.)*

### Step 3: Create a new repository (a project folder)
1. Once logged in, click the **+** icon top right → **New repository**
2. Name it `dockz-website`
3. Leave it set to **Public**
4. Tick **Add a README file**
5. Click **Create repository**

### Step 4: Upload your website files
1. On your new repository's page, click **Add file** → **Upload files**
2. Open the `dockz_site_stripe` folder on your computer
3. Select **everything inside it** (index.html, the api folder, package.json,
   the README files) and **drag them all** into the browser window
4. Wait for the upload bar to finish
5. Scroll down, click the green **Commit changes** button

Your website's files are now online in your GitHub account. 

---

## PART 2 — Get Vercel to host your site

### Step 5: Sign up for Vercel using your GitHub account
1. Go to **vercel.com**
2. Click **Sign Up**
3. Choose **Continue with GitHub**
4. Approve the connection when GitHub asks

### Step 6: Import your project
1. On your Vercel dashboard, click **Add New...** → **Project**
2. You'll see `dockz-website` in the list — click **Import** next to it
3. Leave all the settings as they are
4. Click **Deploy**
5. Wait about 30–60 seconds

You'll get a message like "Congratulations!" with a link such as
`dockz-website.vercel.app` — click it. **Your site is now live on the
internet**, but payments won't work yet — that's Part 3.

---

## PART 3 — Connect Stripe so you can actually get paid

### Step 7: Get your Stripe secret key
1. Log into **dashboard.stripe.com**
2. Look top-left for a toggle that says **Test mode** — make sure it's
   turned **ON** for now (we'll switch to real payments at the very end)
3. Click **Developers** (left sidebar, or top right depending on your view)
4. Click **API keys**
5. Find **Secret key** — click **Reveal test key**, then click to copy it
   (it starts with `sk_test_...`)

⚠️ Never paste this key into an email, chat message, or anywhere public —
treat it like a password.

### Step 8: Give that key to Vercel
1. Back in Vercel, click into your `dockz-website` project
2. Click **Settings** (top menu) → **Environment Variables** (left sidebar)
3. In the **Key** box type: `STRIPE_SECRET_KEY`
4. In the **Value** box, paste the key you copied
5. Click **Save**

### Step 9: Redeploy so the key takes effect
1. Click **Deployments** (top menu)
2. Click the **⋯** (three dots) next to the latest deployment
3. Click **Redeploy** → confirm

### Step 10: Set up the webhook (so orders get recorded)
1. Back in Stripe, go to **Developers** → **Webhooks**
2. Click **Add endpoint**
3. For **Endpoint URL**, type your Vercel address plus `/api/stripe-webhook`
   — for example: `https://dockz-website.vercel.app/api/stripe-webhook`
4. Under **Select events to listen to**, search for and tick
   **checkout.session.completed**
5. Click **Add endpoint**
6. On the page that appears, find **Signing secret** → click **Reveal** →
   copy it (starts with `whsec_...`)

### Step 11: Give that webhook secret to Vercel too
1. Vercel → your project → **Settings** → **Environment Variables**
2. Key: `STRIPE_WEBHOOK_SECRET`
3. Value: paste the `whsec_...` you just copied
4. **Save**
5. Go to **Deployments** → **⋯** → **Redeploy** one more time

---

## PART 4 — Test it before real money is involved

1. Open your live site (`https://dockz-website.vercel.app`)
2. Add a dock to your cart, go to checkout, click **Pay securely →**
3. You'll land on a Stripe payment page. Enter:
   - Card number: **4242 4242 4242 4242**
   - Expiry: any future date (e.g. 12/30)
   - CVC: any 3 digits (e.g. 123)
   - Name/address: anything
4. Click **Pay**
5. You should be sent back to a "🎉 Order confirmed" page on your site
6. Double check it worked: in Stripe, go to **Payments** — you should see
   your test payment listed

If that all worked — nice, the whole thing is wired up correctly.

---

## PART 5 — Go live (start accepting real money)

Only do this once you're happy with the test above.

1. In Stripe, turn the **Test mode** toggle **OFF**
2. Go to **Developers** → **API keys** again — copy the **live** secret key
   (starts with `sk_live_...`)
3. In Vercel: **Settings** → **Environment Variables** → edit
   `STRIPE_SECRET_KEY` → replace the value with your new live key → **Save**
4. Back in Stripe (still in live mode) go to **Developers** → **Webhooks**
   → **Add endpoint** again (yes, a second one — test and live are separate)
   → same URL as before → same event (`checkout.session.completed`) → copy
   its **live** signing secret
5. In Vercel: edit `STRIPE_WEBHOOK_SECRET` with that live `whsec_...` value
6. **Deployments** → **⋯** → **Redeploy**
7. Buy one real dock yourself with a real card to make sure it works, then
   refund yourself from the Stripe **Payments** page

You're live. 🎉

---

---

# PART 6 — Emails (10% signup popup + order confirmations)

The site now has a popup offering 10% off for signing up, and it emails
customers automatically — a welcome email with their code, and an order
confirmation after every purchase. You also get an email yourself for every
new subscriber and every new order. All of it sends from your
**dockzofficial@gmail.com** account.

For that to work, Google needs to let the website send mail as you. That's
done with an **App Password** — a special 16-character password that only
works for sending mail, and that you can revoke any time.

### Step 12: Turn on 2-Step Verification (if you haven't already)
1. Go to **myaccount.google.com** (signed in as dockzofficial@gmail.com)
2. Click **Security** in the left menu
3. Under "How you sign in to Google", click **2-Step Verification**
4. Follow the steps (usually confirming your phone number)

*(App Passwords only exist once 2-Step Verification is on.)*

### Step 13: Create the App Password
1. Still in **Security**, use the search bar at the top of the page and
   search for **App passwords** (or go directly to
   myaccount.google.com/apppasswords)
2. It may ask you to sign in again
3. Where it asks for an app name, type `Dockz website` and click **Create**
4. Google shows you a 16-character password like `abcd efgh ijkl mnop` —
   **copy it now**, it's only shown once

⚠️ Treat this like a password. Don't email it to anyone or paste it in chat.
If it ever leaks, just go back to the same page and delete it.

### Step 14: Give it to Vercel
1. Vercel → your project → **Settings** → **Environment Variables**
2. Add these two, one at a time:
   - Key: `GMAIL_USER` → Value: `dockzofficial@gmail.com`
   - Key: `GMAIL_APP_PASSWORD` → Value: the 16-character password
     (with or without the spaces — both work)
3. **Save**, then **Deployments** → **⋯** → **Redeploy**

---

# PART 7 — Create the WELCOME10 discount code in Stripe

The welcome email tells people to use code **WELCOME10** — this step is what
makes Stripe actually accept it at checkout. Takes 2 minutes.

### Step 15: Create the coupon
1. In the Stripe Dashboard, search for **Coupons** in the top search bar
   (or find it under **Product catalog**)
2. Click **+ New** / **Create coupon**
3. Name: `Welcome 10%`
4. Type: **Percentage discount**, Value: **10%**
5. Duration: **Once** (applies to one order per customer)
6. Click **Create coupon**

### Step 16: Attach the code customers type in
1. Open the coupon you just made
2. Find the **Promotion codes** section → click **+ Add** / **Create promotion code**
3. Where it offers a random code, change it to exactly: `WELCOME10`
4. Click **Create**

⚠️ Do this **twice** — once with Test mode ON (so your test checkouts accept
the code) and once with Test mode OFF (for real customers). Coupons don't
carry over between the two modes.

---

# PART 8 — Upload the new files & test the emails

### Step 17: Update your files on GitHub
The new version of the site is in the updated zip I sent you
(`dockz_site_stripe_v2.zip`). Unzip it, then:
1. Go to your repo → **Add file** → **Upload files**
2. This time, **drag the whole `api` folder, the whole `lib` folder, and
   `index.html`** from the unzipped folder into the browser window —
   drag the actual folders, not the files inside them, so they keep their
   structure
3. **Commit changes** — Vercel redeploys on its own

### Step 18: Test it
1. Visit your site in a private/incognito window (the popup only shows to
   first-time visitors) — the 10% popup should appear after a couple of seconds
2. Enter your own email → you should receive the welcome email within a minute
   (check spam the first time, and mark it "Not spam" if it's there)
3. You should ALSO get a "📬 New Dockz subscriber" email — that's your record
4. Do a test checkout (card 4242 4242 4242 4242) and try typing `WELCOME10`
   in the promo code box on the Stripe payment page — total should drop 10%
5. After paying you should get TWO emails: the customer confirmation (to the
   email you entered on the Stripe page) and a "🧾 NEW ORDER" alert to you

---

# PART 9 — The v3 redesign (light look + real product photos)

The v3 update restyles the whole site (lighter, more professional) and adds
real product images rendered from the actual Dockz design — three finishes
each for Classic and Pro. When a shopper picks a colour, the photo changes.
No new accounts, keys, or settings — just new files.

### Step 19: Upload the v3 files
1. Unzip `dockz_site_stripe_v3.zip`
2. Go to your GitHub repo → **Add file** → **Upload files**
3. Drag in: the **`images` folder** (new — this has the product photos),
   the **`api` folder**, the **`lib` folder**, and **`index.html`**.
   As always: drag the folders themselves so they keep their structure.
4. **Commit changes** — Vercel redeploys itself within a minute

### Step 20: Check it
1. Open your site — it should now be light with photos of the actual dock
2. On the Dockz Classic page, click the three colour circles — the photo
   should switch between white, black and grey
3. Add to cart → the cart shows the product photo in the colour you picked

### Swapping in real photos later (recommended before launch)
The current images are engineering renders of the true design. When you've
printed a batch you're proud of, photograph them (phone camera + daylight +
white poster board works fine) and replace the files in the `images` folder —
keep the exact same names (`classic-white.png`, `classic-black.png`,
`classic-grey.png`, `pro-white.png`, `pro-black.png`, `pro-grey.png`) and
everything keeps working with zero code changes.

---

## If something goes wrong
- **"Payments are not configured yet" error** → you likely typed the
  environment variable name wrong. It must be exactly `STRIPE_SECRET_KEY`.
- **Nothing happens when you click Pay** → open your browser's console
  (right-click → Inspect → Console tab) and check for a red error, or just
  message me what you see and I'll help debug it.
- **Order not showing up** → check Vercel → your project → **Logs** for a
  line starting with `🧾 NEW DOCKZ ORDER`.
- **Welcome email never arrives** → almost always the App Password: check
  `GMAIL_USER` and `GMAIL_APP_PASSWORD` are spelled exactly right in Vercel,
  and that you redeployed after adding them. Vercel → **Logs** will show a
  line like "Welcome email failed" with the reason.
- **Emails land in spam** → normal for a brand-new sender. Mark one as
  "Not spam" and it improves. For serious volume later, we'd move to a
  custom domain with proper email authentication.
- **WELCOME10 rejected at checkout** → you created the promotion code in the
  other mode (test vs live) — see the ⚠️ in Step 16.

Any time you want to change a price or add a product, just tell me — I'll
update the files and you re-upload them to GitHub (same drag-and-drop as
Step 4), and Vercel updates automatically.
