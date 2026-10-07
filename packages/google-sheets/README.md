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
2. Configure Application Default Credentials. For a service account, set
   `GOOGLE_APPLICATION_CREDENTIALS` to its JSON key file and share the target
   spreadsheet with the service account's email address. For a Google user
   account, the Google Cloud CLI's default ADC scopes do not include Google
   Sheets. Create a Desktop app OAuth client ID for your project using
   [Google's credential guide](https://developers.google.com/workspace/guides/create-credentials),
   and download its JSON file outside this repository. Then run the following,
   replacing the placeholders with the OAuth client JSON path and project ID:

   ```sh
   gcloud auth application-default login --client-id-file="PATH_TO_OAUTH_CLIENT_JSON" --scopes="openid,https://www.googleapis.com/auth/userinfo.email,https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/spreadsheets"
   gcloud auth application-default set-quota-project PROJECT_ID
   ```

   The account must have `serviceusage.services.use` permission on the quota
   project. A warning about the unrelated `sqlservice.login` scope does not
   prevent Sheets access.
3. From the repository root, install dependencies and build the CLI:

   ```sh
   npm ci
   npm run install:packages
   npm run build --prefix packages/google-sheets
   ```

## Usage

Pass the spreadsheet ID from its URL and a Sheets A1 range:

```sh
npm run start:sheets -- get SPREADSHEET_ID 'Sheet1!A1:C10'
npm run start:sheets -- update SPREADSHEET_ID 'Sheet1!A1:B2' --values '[["Name", "Count"], ["Tea", 3]]'
npm run start:sheets -- append SPREADSHEET_ID 'Sheet1!A:B' --values '[["Coffee", 5]]'
```

`--values -` reads a JSON array of rows from standard input:

```sh
printf '[["Coffee", 5]]' | npm run start:sheets -- append SPREADSHEET_ID 'Sheet1!A:B' --values -
```

Updates use the Sheets API's `USER_ENTERED` mode, so values are interpreted as
if entered in the Google Sheets UI. Append inserts new rows after the existing
table. The tool does not store credentials or spreadsheet contents.

## Development

Run the unit tests with:

```sh
npm test --prefix packages/google-sheets
```
