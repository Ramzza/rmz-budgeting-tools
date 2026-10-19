import type { sheets_v4 } from "googleapis";

export type CellValue = string | number | boolean | null;
export type Values = CellValue[][];
export interface ValueUpdate {
  range: string;
  values: Values;
}

const INVALID_GRANT_MESSAGE =
  "Google Application Default Credentials were rejected (invalid_grant). Reauthenticate them, then retry. For local user credentials, run " +
  "`gcloud auth application-default login --scopes=https://www.googleapis.com/auth/spreadsheets`.";

async function runSheetsRequest<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
    if (/\binvalid_grant\b/i.test(message)) {
      throw new Error(INVALID_GRANT_MESSAGE, { cause: error });
    }
    throw error;
  }
}

export async function createSheetsClient(): Promise<sheets_v4.Sheets> {
  const { google } = await import("googleapis");
  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

export async function getValues(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  range: string,
): Promise<Values> {
  const response = await runSheetsRequest(() =>
    sheets.spreadsheets.values.get({ spreadsheetId, range }),
  );
  return (response.data.values ?? []) as Values;
}

export async function updateValues(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  range: string,
  values: Values,
): Promise<sheets_v4.Schema$UpdateValuesResponse> {
  const response = await runSheetsRequest(() =>
    sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    }),
  );
  return response.data;
}

export async function appendValues(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  range: string,
  values: Values,
): Promise<sheets_v4.Schema$AppendValuesResponse> {
  const response = await runSheetsRequest(() =>
    sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values },
    }),
  );
  return response.data;
}

export async function updateBatchValues(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  updates: readonly ValueUpdate[],
): Promise<sheets_v4.Schema$BatchUpdateValuesResponse> {
  const response = await runSheetsRequest(() =>
    sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data: updates.map(({ range, values }) => ({ range, values })),
      },
    }),
  );
  return response.data;
}
