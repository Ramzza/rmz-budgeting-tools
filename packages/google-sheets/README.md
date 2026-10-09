# rmz-google-sheets

A small command-line tool for reading and editing Google Sheets ranges.

See the [root PRD](../../PRD.md) for the product requirements and test mappings.

## Setup

Requires Node.js 22 or later.

For Google user-account authentication, install the Google Cloud CLI in the
same environment where you will run `rmz-sheets`. It is separate from this
project and is not installed by `npm`. A Windows installation is not available
inside an Ubuntu or Vagrant VM.

**Ubuntu/Debian (including an Ubuntu VM):**

```sh
sudo apt-get update
sudo apt-get install -y ca-certificates gnupg curl
curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg \
  | sudo gpg --dearmor --yes -o /usr/share/keyrings/cloud.google.gpg
echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" \
  | sudo tee /etc/apt/sources.list.d/google-cloud-sdk.list
sudo apt-get update
sudo apt-get install -y google-cloud-cli
```

**Windows:**

Download and run the [Google Cloud CLI installer](https://dl.google.com/dl/cloudsdk/channels/rapid/GoogleCloudSDKInstaller.exe).
After it finishes, open a new PowerShell window and verify the installation:

```powershell
gcloud --version
```

1. Enable the Google Sheets API in your Google Cloud project.
2. Configure Application Default Credentials:

   - **Service account:** Set `GOOGLE_APPLICATION_CREDENTIALS` to its JSON key
     file and share the target spreadsheet with the service account's email
     address.
   - **Google user account:** In Google Cloud Console, create or select a
     project and open **Google Auth Platform** for it. Add
     `https://www.googleapis.com/auth/spreadsheets` under **Data Access**, and
     add your Google account under **Audience** as a test user. Under
     **Clients**, create a **Desktop app** OAuth client and download its client
     secret JSON file (for example, `secret.json`). Keep this file outside the
     repository.

     Run the following in the same environment where you will run `rmz-sheets`,
     replacing the placeholder with the path to the downloaded JSON file:

     ```sh
     gcloud auth application-default login \
       --scopes="https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/spreadsheets" \
       --client-id-file=PATH-TO-EXPORTED-CLIENT-SECRET-JSON
     ```

     When the browser opens, sign in as the test user and grant access. The
     authenticated account must also have access to the target spreadsheet.
3. From the repository root, install dependencies and build the CLI:

   ```sh
   npm ci
   npm run install:packages
   npm run build --prefix packages/google-sheets
   ```

## Usage

Pass the spreadsheet ID from its URL and a Sheets A1 range. The ID remains an
optional positional argument; if omitted, the CLI reads
`GOOGLE_SHEETS_SPREADSHEET_ID` from a `.env` file in the current working
directory, then prompts for it if the variable is unset:

```sh
npm run start:sheets -- get SPREADSHEET_ID 'Sheet1!A1:C10'
npm run start:sheets -- update SPREADSHEET_ID 'Sheet1!A1:B2' --values '[["Name", "Count"], ["Tea", 3]]'
npm run start:sheets -- append SPREADSHEET_ID 'Sheet1!A:B' --values '[["Coffee", 5]]'
```

To use the configured ID instead:

```dotenv
GOOGLE_SHEETS_SPREADSHEET_ID=YOUR_SPREADSHEET_ID
```

Then omit the positional ID:

```sh
npm run start:sheets -- get 'Sheet1!A1:C10'
```

`--values -` reads a JSON array of rows from standard input:

```sh
printf '[["Coffee", 5]]' | npm run start:sheets -- append SPREADSHEET_ID 'Sheet1!A:B' --values -
```

Fill category totals from a saved JSON file, or pipe the category JSON output
from `rmz-revolut-spending`. The `YYYY-MM` value selects a tab with the same
name. The command reads category names from `A43:A70` and writes the matching
RON totals to column D for profile Z (the default) or column C for profile N.
Sheet category names are matched case-insensitively after trimming whitespace;
categories absent from the input are written as `0`.

```sh
npm run start:sheets -- fill-spendings 2026-09 --spending-input ./spendings.json
npm --silent run start:revolut-spending -- categories ./spending.html \
  | npm --silent run start:sheets -- fill-spendings 2026-09 --spending-input -
npm run start:sheets -- fill-spendings 2026-09 \
  --spending-input ./spendings.json --profile N --spreadsheet-id SPREADSHEET_ID
```

If a category in the input does not exist in the selected sheet tab, the
command reports an error instead of silently dropping the amount. When
`--spreadsheet-id` is omitted, `GOOGLE_SHEETS_SPREADSHEET_ID` must be set in a
`.env` file in the working directory; this command does not prompt for an ID.

Updates use the Sheets API's `USER_ENTERED` mode, so values are interpreted as
if entered in the Google Sheets UI. Append inserts new rows after the existing
table. The tool does not store credentials, spreadsheet contents, or spending
input.

## Development

Run the unit tests with:

```sh
npm test --prefix packages/google-sheets
```

To manually verify access to a Google Sheet, configure Application Default
Credentials and share the test sheet with the authenticated account. Create
`packages/google-sheets/.env` with a spreadsheet ID and one populated cell:

```dotenv
GOOGLE_SHEETS_TEST_SPREADSHEET_ID=YOUR_SPREADSHEET_ID
GOOGLE_SHEETS_TEST_RANGE=Budget!A1
```

Then run:

```sh
npm run test:connection --prefix packages/google-sheets
```

The command automatically loads the package-local `.env` with Node's
`--env-file` option. The file is git-ignored. The test requires a single-cell
A1 range and credentials with access to the spreadsheet; it does not print or
save the cell contents.
