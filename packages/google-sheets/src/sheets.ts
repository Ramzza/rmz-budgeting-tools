import type { sheets_v4 } from "googleapis";

export type CellValue = string | number | boolean | null;
export type Values = CellValue[][];

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
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return (response.data.values ?? []) as Values;
}

export async function updateValues(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  range: string,
  values: Values,
): Promise<sheets_v4.Schema$UpdateValuesResponse> {
  const response = await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
  return response.data;
}

export async function appendValues(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  range: string,
  values: Values,
): Promise<sheets_v4.Schema$AppendValuesResponse> {
  const response = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values },
  });
  return response.data;
}
