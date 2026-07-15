import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = decodeURIComponent(new URL("../../outputs/ai-shark-tank-financial-model/", import.meta.url).pathname).replace(/^\/(.:)/, "$1");
const previewDir = decodeURIComponent(new URL("./previews/", import.meta.url).pathname).replace(/^\/(.:)/, "$1");
await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(previewDir, { recursive: true });

const wb = Workbook.create();
const summary = wb.worksheets.add("Summary");
const assumptions = wb.worksheets.add("Assumptions");
const forecast = wb.worksheets.add("Forecast");
const scenarios = wb.worksheets.add("Scenarios");
const checks = wb.worksheets.add("Checks");
const sources = wb.worksheets.add("Sources");
await wb.comments.setSelf({ displayName: "Malir" });

const navy = "#14213D";
const blue = "#2563EB";
const teal = "#14B8A6";
const coral = "#F97366";
const gold = "#F4B942";
const paleBlue = "#EAF2FF";
const paleGold = "#FFF6D8";
const paleGreen = "#E8F7F1";
const paleRed = "#FDECEC";
const light = "#F5F7FA";
const gray = "#667085";
const border = "#D7DEE8";
const moneyFmt = '$#,##0;[Red]($#,##0);-';
const pctFmt = '0.0%;[Red](0.0%);-';
const countFmt = '#,##0;[Red](#,##0);-';

function title(sheet, range, text, subtitleRange, subtitle) {
  sheet.getRange(range).merge();
  sheet.getRange(range).values = [[text]];
  sheet.getRange(range).format = { fill: navy, font: { color: "#FFFFFF", bold: true, size: 20 }, verticalAlignment: "center" };
  sheet.getRange(range).format.rowHeight = 34;
  if (subtitleRange) {
    sheet.getRange(subtitleRange).merge();
    sheet.getRange(subtitleRange).values = [[subtitle]];
    sheet.getRange(subtitleRange).format = { fill: navy, font: { color: "#D9E2F2", italic: true, size: 10 }, verticalAlignment: "center" };
    sheet.getRange(subtitleRange).format.rowHeight = 26;
  }
}

function section(sheet, range, text) {
  sheet.getRange(range).merge();
  sheet.getRange(range).values = [[text]];
  sheet.getRange(range).format = { fill: navy, font: { color: "#FFFFFF", bold: true }, verticalAlignment: "center" };
}

function setWidths(sheet, pairs) {
  for (const [range, width] of pairs) sheet.getRange(range).format.columnWidth = width;
}

for (const sh of [summary, assumptions, forecast, scenarios, checks, sources]) sh.showGridLines = false;

// ASSUMPTIONS
title(assumptions, "A1:F1", "AI Shark Tank — Assumptions", "A2:F2", "Blue-font cells are editable planning inputs. Change the selected scenario in B4.");
assumptions.getRange("A4:B4").values = [["Selected scenario", "Base"]];
assumptions.getRange("A4").format = { fill: paleBlue, font: { bold: true } };
assumptions.getRange("B4").format = { fill: paleGold, font: { color: "#0000FF", bold: true }, horizontalAlignment: "center", borders: { preset: "outside", style: "thin", color: gold } };
assumptions.getRange("B4").dataValidation = { rule: { type: "list", values: ["Conservative", "Base", "Upside"] } };

const assumptionRows = [
  ["ACQUISITION & RETENTION", null, null, null, null, null],
  ["Website visits — month 1", "visits", 600, 1000, 1500, null],
  ["Monthly website traffic growth", "% / mo", 0.06, 0.12, 0.18, null],
  ["Visitor-to-signup rate", "%", 0.06, 0.08, 0.10, null],
  ["Signup-to-paid conversion", "%", 0.08, 0.12, 0.16, null],
  ["Monthly individual churn", "%", 0.08, 0.06, 0.04, null],
  ["B2B leads — month 1", "leads", 8, 15, 25, null],
  ["Monthly B2B lead growth", "% / mo", 0.04, 0.08, 0.12, null],
  ["B2B lead close rate", "%", 0.05, 0.08, 0.12, null],
  ["Monthly B2B account churn", "%", 0.04, 0.03, 0.02, null],
  ["PRICING & USAGE", null, null, null, null, null],
  ["Individual subscription ARPU", "$ / month", 19, 24, 29, null],
  ["Program / accelerator ARPA", "$ / month", 199, 249, 349, null],
  ["Reports per individual / month", "reports", 1.2, 1.5, 1.8, null],
  ["Reports per B2B program / month", "reports", 18, 25, 35, null],
  ["AI processing cost per report", "$ / report", 1.25, 0.85, 0.60, null],
  ["Hosting & storage per active account", "$ / month", 0.55, 0.45, 0.35, null],
  ["Payment processing rate", "% revenue", 0.032, 0.029, 0.027, null],
  ["OPERATING COSTS & CASH", null, null, null, null, null],
  ["Marketing spend — month 1", "$ / month", 600, 1000, 1800, null],
  ["Monthly marketing spend growth", "% / mo", 0.03, 0.06, 0.09, null],
  ["Product / engineering contractor", "$ / month", 1800, 2500, 4000, null],
  ["Founder monthly payroll after start", "$ / month", 3000, 4000, 5000, null],
  ["Founder payroll start month", "month #", 10, 7, 4, null],
  ["Sales/support monthly payroll", "$ / month", 1800, 2500, 3500, null],
  ["Sales/support start month", "month #", 16, 10, 7, null],
  ["Software tools — month 1", "$ / month", 350, 500, 750, null],
  ["Monthly software cost growth", "% / mo", 0.03, 0.05, 0.07, null],
  ["General & administrative", "$ / month", 250, 350, 500, null],
  ["Starting cash", "$", 35000, 50000, 75000, null],
  ["Planned financing", "$", 100000, 150000, 250000, null],
  ["Financing month", "month #", 13, 13, 10, null],
];
assumptions.getRange("A6:F37").values = assumptionRows;
assumptions.getRange("A6:F6").format = { fill: navy, font: { color: "#FFFFFF", bold: true } };
assumptions.getRange("A16:F16").format = { fill: navy, font: { color: "#FFFFFF", bold: true } };
assumptions.getRange("A24:F24").format = { fill: navy, font: { color: "#FFFFFF", bold: true } };
assumptions.getRange("A5:F5").values = [["Driver", "Unit", "Conservative", "Base", "Upside", "Selected"]];
assumptions.getRange("A5:F5").format = { fill: "#DCE5F2", font: { bold: true }, borders: { bottom: { style: "thin", color: border } } };

const dataRows = [];
for (let r = 7; r <= 37; r++) if (![16, 24].includes(r)) dataRows.push(r);
for (const r of dataRows) {
  assumptions.getRange(`F${r}`).formulas = [[`=IF($B$4="Conservative",C${r},IF($B$4="Base",D${r},E${r}))`]];
  assumptions.getRange(`C${r}:E${r}`).format = { fill: paleGold, font: { color: "#0000FF" } };
  assumptions.getRange(`F${r}`).format = { fill: paleGreen, font: { color: "#008000", bold: true } };
  const note = `Planning assumption for AI Shark Tank. Internally estimated for the ${assumptions.getRange(`${r}:${r}`).values?.[0]?.[0] ?? "driver"}; replace with observed data as the beta produces results. As of 2026-07-13.`;
  for (const c of ["C", "D", "E"]) wb.comments.addThread({ cell: assumptions.getRange(`${c}${r}`) }, note);
}
assumptions.getRange("C7:F37").format.horizontalAlignment = "right";
for (const r of [8,9,10,11,13,14,15,23,26,33]) assumptions.getRange(`C${r}:F${r}`).format.numberFormat = pctFmt;
for (const r of [17,18,21,22,25,27,28,30,32,34,35,36]) assumptions.getRange(`C${r}:F${r}`).format.numberFormat = moneyFmt;
for (const r of [7,12,19,20,29,31,37]) assumptions.getRange(`C${r}:F${r}`).format.numberFormat = countFmt;
assumptions.getRange("C19:F20").format.numberFormat = "0.0";
assumptions.getRange("C21:F22").format.numberFormat = "$0.00";
assumptions.freezePanes.freezeRows(5);
setWidths(assumptions, [["A:A", 36], ["B:B", 16], ["C:F", 15]]);

// FORECAST
title(forecast, "A1:AK1", "AI Shark Tank — 36-Month Operating Forecast", "A2:AK2", "Formula-driven monthly model. Green text indicates links to the Assumptions sheet.");
const months = Array.from({ length: 36 }, (_, i) => new Date(Date.UTC(2026, 7 + i, 1)));
forecast.getRange("B4:AK4").values = [months];
forecast.getRange("B4:AK4").format = { fill: "#DCE5F2", font: { bold: true }, horizontalAlignment: "right", numberFormat: "mmm-yy", borders: { bottom: { style: "thin", color: border } } };
forecast.getRange("A4").values = [["Month"]];
forecast.getRange("A4").format = { fill: "#DCE5F2", font: { bold: true } };
forecast.getRange("B5:AK5").values = [Array.from({ length: 36 }, (_, i) => i + 1)];
forecast.getRange("A5").values = [["Month #"]];
forecast.getRange("A5:AK5").format = { font: { color: gray, italic: true }, numberFormat: countFmt };

const labels = {
  7:"B2C ACQUISITION & RETENTION",8:"Website visits",9:"Visitor-to-signup rate",10:"New free signups",11:"Signup-to-paid conversion",12:"New paid individuals",13:"Beginning paid individuals",14:"Monthly individual churn",15:"Churned paid individuals",16:"Ending paid individuals",
  18:"B2B ACQUISITION & RETENTION",19:"B2B leads",20:"B2B close rate",21:"New B2B programs",22:"Beginning B2B programs",23:"Monthly B2B churn",24:"Churned B2B programs",25:"Ending B2B programs",
  27:"REVENUE",28:"Individual subscription ARPU",29:"Program / accelerator ARPA",30:"B2C subscription revenue",31:"B2B program revenue",32:"Total revenue",33:"Monthly recurring revenue (MRR)",
  35:"COST OF REVENUE",36:"Reports per individual",37:"Reports per B2B program",38:"Total AI reports",39:"AI cost per report",40:"AI processing cost",41:"Payment processing rate",42:"Payment fees",43:"Hosting & storage",44:"Total cost of revenue",45:"Gross profit",46:"Gross margin",
  48:"OPERATING EXPENSES",49:"Marketing",50:"Product / engineering contractor",51:"Founder payroll",52:"Sales & support",53:"Software tools",54:"General & administrative",55:"Total operating expenses",56:"Operating profit / (loss)",
  58:"CASH FLOW",59:"Beginning cash",60:"Operating cash flow",61:"Financing",62:"Ending cash",63:"Cash burn (before financing)",64:"EBITDA-positive flag"
};
for (const [r, label] of Object.entries(labels)) forecast.getRange(`A${r}`).values = [[label]];
for (const r of [7,18,27,35,48,58]) section(forecast, `A${r}:AK${r}`, labels[r]);

const setAcross = (row, formulaFn) => {
  forecast.getRange(`B${row}:AK${row}`).formulas = [Array.from({ length: 36 }, (_, i) => formulaFn(i, String.fromCharCode(66 + i)))];
};
// Excel column converter beyond Z
function col(n) { let s=""; while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);} return s; }
const across = (row, fn) => forecast.getRange(`B${row}:AK${row}`).formulas = [Array.from({length:36},(_,i)=>fn(i,col(i+2)))];

across(8,(i,c)=>`='Assumptions'!$F$7*(1+'Assumptions'!$F$8)^(${c}$5-1)`);
across(9,()=>`='Assumptions'!$F$9`); across(10,(i,c)=>`=${c}8*${c}9`); across(11,()=>`='Assumptions'!$F$10`); across(12,(i,c)=>`=${c}10*${c}11`);
across(13,(i,c)=>i===0?"=0":`=${col(i+1)}16`); across(14,()=>`='Assumptions'!$F$11`); across(15,(i,c)=>`=${c}13*${c}14`); across(16,(i,c)=>`=${c}13+${c}12-${c}15`);
across(19,(i,c)=>`='Assumptions'!$F$12*(1+'Assumptions'!$F$13)^(${c}$5-1)`); across(20,()=>`='Assumptions'!$F$14`); across(21,(i,c)=>`=${c}19*${c}20`);
across(22,(i,c)=>i===0?"=0":`=${col(i+1)}25`); across(23,()=>`='Assumptions'!$F$15`); across(24,(i,c)=>`=${c}22*${c}23`); across(25,(i,c)=>`=${c}22+${c}21-${c}24`);
across(28,()=>`='Assumptions'!$F$17`); across(29,()=>`='Assumptions'!$F$18`); across(30,(i,c)=>`=${c}16*${c}28`); across(31,(i,c)=>`=${c}25*${c}29`); across(32,(i,c)=>`=SUM(${c}30:${c}31)`); across(33,(i,c)=>`=${c}32`);
across(36,()=>`='Assumptions'!$F$19`); across(37,()=>`='Assumptions'!$F$20`); across(38,(i,c)=>`=${c}16*${c}36+${c}25*${c}37`); across(39,()=>`='Assumptions'!$F$21`); across(40,(i,c)=>`=${c}38*${c}39`); across(41,()=>`='Assumptions'!$F$23`); across(42,(i,c)=>`=${c}32*${c}41`); across(43,(i,c)=>`=(${c}16+${c}25)*'Assumptions'!$F$22`); across(44,(i,c)=>`=SUM(${c}40,${c}42:${c}43)`); across(45,(i,c)=>`=${c}32-${c}44`); across(46,(i,c)=>`=IF(${c}32=0,0,${c}45/${c}32)`);
across(49,(i,c)=>`='Assumptions'!$F$25*(1+'Assumptions'!$F$26)^(${c}$5-1)`); across(50,()=>`='Assumptions'!$F$27`); across(51,(i,c)=>`=IF(${c}$5>='Assumptions'!$F$29,'Assumptions'!$F$28,0)`); across(52,(i,c)=>`=IF(${c}$5>='Assumptions'!$F$31,'Assumptions'!$F$30,0)`); across(53,(i,c)=>`='Assumptions'!$F$32*(1+'Assumptions'!$F$33)^(${c}$5-1)`); across(54,()=>`='Assumptions'!$F$34`); across(55,(i,c)=>`=SUM(${c}49:${c}54)`); across(56,(i,c)=>`=${c}45-${c}55`);
across(59,(i,c)=>i===0?"='Assumptions'!$F$35":`=${col(i+1)}62`); across(60,(i,c)=>`=${c}56`); across(61,(i,c)=>`=IF(${c}$5='Assumptions'!$F$37,'Assumptions'!$F$36,0)`); across(62,(i,c)=>`=${c}59+${c}60+${c}61`); across(63,(i,c)=>`=MAX(0,-${c}60)`); across(64,(i,c)=>`=IF(${c}56>0,1,0)`);

forecast.getRange("B8:AK64").format.horizontalAlignment = "right";
for (const r of [9,11,14,20,23,41,46]) forecast.getRange(`B${r}:AK${r}`).format.numberFormat = pctFmt;
for (const r of [28,29,30,31,32,33,39,40,42,43,44,45,49,50,51,52,53,54,55,56,59,60,61,62,63]) forecast.getRange(`B${r}:AK${r}`).format.numberFormat = moneyFmt;
for (const r of [8,10,12,13,15,16,19,21,22,24,25,36,37,38,64]) forecast.getRange(`B${r}:AK${r}`).format.numberFormat = countFmt;
forecast.getRange("B36:AK36").format.numberFormat = "0.0";
forecast.getRange("B39:AK39").format.numberFormat = "$0.00";
for (const r of [8,9,11,14,19,20,23,28,29,36,37,39,41,43,49,50,51,52,53,54,59,61]) forecast.getRange(`B${r}:AK${r}`).format.font = { color: "#008000" };
for (const r of [16,25,32,45,46,55,56,62]) forecast.getRange(`A${r}:AK${r}`).format = { font: { bold: true }, borders: { top: { style: "thin", color: border } } };
forecast.freezePanes.freezeRows(5); forecast.freezePanes.freezeColumns(1);
setWidths(forecast, [["A:A", 34], ["B:AK", 13]]);

// SUMMARY
title(summary, "A1:L1", "AI Shark Tank — Financial Model", "A2:L2", "36-month planning model | Scenario controlled on Assumptions tab | USD | Monthly forecast beginning Aug 2026");
summary.getRange("A4:B4").values = [["Selected scenario", null]];
summary.getRange("B4").formulas = [["='Assumptions'!B4"]];
summary.getRange("D4:E4").values = [["Model status", null]];
summary.getRange("E4").formulas = [["='Checks'!B3"]];
summary.getRange("A4:E4").format = { fill: light, font: { bold: true }, borders: { preset: "outside", style: "thin", color: border } };
summary.getRange("B4").format.font = { color: "#008000", bold: true };

const kpis = [["Year 1 Revenue", "=SUM('Forecast'!B32:M32)"], ["Year 3 Revenue", "=SUM('Forecast'!Z32:AK32)"], ["Month 36 MRR", "='Forecast'!AK33"], ["Month 36 Gross Margin", "='Forecast'!AK46"], ["Minimum Cash", "=MIN('Forecast'!B62:AK62)"], ["Ending Cash", "='Forecast'!AK62"]];
const kpiRanges = [["A7:C10",0],["E7:G10",1],["I7:K10",2],["A12:C15",3],["E12:G15",4],["I12:K15",5]];
for (const [rg, idx] of kpiRanges) {
  summary.getRange(rg).format = { fill: idx===4 && false ? paleRed : "#FFFFFF", borders: { preset: "outside", style: "thin", color: border } };
  const [start] = rg.split(":"); const letter=start.match(/[A-Z]+/)[0]; const row=Number(start.match(/\d+/)[0]);
  summary.getRange(`${letter}${row}:${col((letter.charCodeAt(0)-64)+2)}${row}`).merge();
  summary.getRange(`${letter}${row}`).values = [[kpis[idx][0]]];
  summary.getRange(`${letter}${row}`).format = { fill: paleBlue, font: { color: navy, bold: true } };
  summary.getRange(`${letter}${row+1}:${col((letter.charCodeAt(0)-64)+2)}${row+3}`).merge();
  summary.getRange(`${letter}${row+1}`).formulas = [[kpis[idx][1]]];
  summary.getRange(`${letter}${row+1}`).format = { font: { color: navy, bold: true, size: 18 }, horizontalAlignment: "center", verticalAlignment: "center", numberFormat: idx===3?pctFmt:moneyFmt };
}

section(summary, "A18:F18", "ANNUAL SUMMARY");
summary.getRange("A19:D19").values = [["Metric", "Year 1", "Year 2", "Year 3"]];
summary.getRange("A19:D19").format = { fill: "#DCE5F2", font: { bold: true } };
summary.getRange("A20:A25").values = [["Revenue"],["Gross profit"],["Operating expenses"],["Operating profit / (loss)"],["Ending MRR"],["Ending cash"]];
const annualRanges = [["B","B","M"],["C","N","Y"],["D","Z","AK"]];
for (const [dst,start,end] of annualRanges) {
  summary.getRange(`${dst}20`).formulas = [[`=SUM('Forecast'!${start}32:${end}32)`]];
  summary.getRange(`${dst}21`).formulas = [[`=SUM('Forecast'!${start}45:${end}45)`]];
  summary.getRange(`${dst}22`).formulas = [[`=SUM('Forecast'!${start}55:${end}55)`]];
  summary.getRange(`${dst}23`).formulas = [[`=SUM('Forecast'!${start}56:${end}56)`]];
  summary.getRange(`${dst}24`).formulas = [[`='Forecast'!${end}33`]];
  summary.getRange(`${dst}25`).formulas = [[`='Forecast'!${end}62`]];
}
summary.getRange("B20:D25").format.numberFormat = moneyFmt;
summary.getRange("A23:D23").format = { font: { bold: true }, borders: { top: { style: "thin", color: border } } };

section(summary, "A28:F28", "KEY UNIT ECONOMICS & MILESTONES");
summary.getRange("A29:B34").values = [["Metric","Value"],["Month 1 blended gross margin",null],["Month 36 blended gross margin",null],["Month 36 active paid individuals",null],["Month 36 active B2B programs",null],["First EBITDA-positive month",null]];
summary.getRange("B30").formulas = [["='Forecast'!B46"]]; summary.getRange("B31").formulas = [["='Forecast'!AK46"]]; summary.getRange("B32").formulas = [["='Forecast'!AK16"]]; summary.getRange("B33").formulas = [["='Forecast'!AK25"]]; summary.getRange("B34").formulas = [["=IF(SUM('Forecast'!B64:AK64)=0,\"Not reached\",INDEX('Forecast'!B4:AK4,1,MATCH(1,'Forecast'!B64:AK64,0)))"]];
summary.getRange("A29:B29").format = { fill: "#DCE5F2", font: { bold: true } }; summary.getRange("B30:B31").format.numberFormat=pctFmt; summary.getRange("B32:B33").format.numberFormat=countFmt; summary.getRange("B34").format.numberFormat="mmm-yy";

summary.getRange("F18:L18").merge(); summary.getRange("F18").values=[["REVENUE & CASH TREND"]]; summary.getRange("F18:L18").format={fill:navy,font:{color:"#FFFFFF",bold:true}};
summary.getRange("N1:P37").values = [["Month","Revenue","Ending Cash"], ...months.map(()=>[null,null,null])];
for(let i=0;i<36;i++){ const r=i+2,c=col(i+2); summary.getRange(`N${r}`).formulas=[[`=TEXT('Forecast'!${c}4,\"mmm-yy\")`]]; summary.getRange(`O${r}`).formulas=[[`='Forecast'!${c}32`]]; summary.getRange(`P${r}`).formulas=[[`='Forecast'!${c}62`]]; }
summary.getRange("O2:P37").format.numberFormat=moneyFmt;
const trend=summary.charts.add("line",summary.getRange("N1:P37")); trend.title="Monthly Revenue and Ending Cash ($)"; trend.hasLegend=true; trend.xAxis={axisType:"textAxis",textStyle:{fontSize:9}}; trend.yAxis={numberFormatCode:"$#,##0"}; trend.setPosition("F19","L35");
summary.getRange("N:P").format.columnWidth=12;
setWidths(summary, [["A:A", 26],["B:D",15],["E:E",12],["F:L",13]]);

// SCENARIOS — formula-driven compact comparison
title(scenarios, "A1:J1", "Scenario Comparison", "A2:J2", "Side-by-side 36-month outcomes using the same acquisition, pricing, cost, and cash logic.");
scenarios.getRange("A4:G4").values=[["Scenario","Year 1 Revenue","Year 2 Revenue","Year 3 Revenue","Month 36 MRR","Minimum Cash","Ending Cash"]];
scenarios.getRange("A4:G4").format={fill:"#DCE5F2",font:{bold:true}};
scenarios.getRange("A5:A7").values=[["Conservative"],["Base"],["Upside"]];
const scenCols=["C","D","E"];
const scenNames=["Conservative","Base","Upside"];
for(let s=0;s<3;s++){
  const start=10+s*16; const ac=scenCols[s];
  scenarios.getRange(`A${start}:AK${start}`).values=[["Month",...months.map(d=>d)]]; scenarios.getRange(`A${start}:AK${start}`).format={fill:light,font:{bold:true},numberFormat:"mmm-yy"};
  const metrics=["Paid individuals","B2B programs","Revenue","Cost of revenue","Operating expenses","Operating profit","Financing","Ending cash"];
  scenarios.getRange(`A${start+1}:A${start+8}`).values=metrics.map(x=>[x]);
  for(let i=0;i<36;i++){
    const cc=col(i+2), prev=col(i+1), m=i+1;
    const paid=i===0?`=('Assumptions'!$${ac}$7*'Assumptions'!$${ac}$9*'Assumptions'!$${ac}$10)`:`=${prev}${start+1}*(1-'Assumptions'!$${ac}$11)+'Assumptions'!$${ac}$7*(1+'Assumptions'!$${ac}$8)^(${m}-1)*'Assumptions'!$${ac}$9*'Assumptions'!$${ac}$10`;
    const b2b=i===0?`=('Assumptions'!$${ac}$12*'Assumptions'!$${ac}$14)`:`=${prev}${start+2}*(1-'Assumptions'!$${ac}$15)+'Assumptions'!$${ac}$12*(1+'Assumptions'!$${ac}$13)^(${m}-1)*'Assumptions'!$${ac}$14`;
    scenarios.getRange(`${cc}${start+1}`).formulas=[[paid]]; scenarios.getRange(`${cc}${start+2}`).formulas=[[b2b]];
    scenarios.getRange(`${cc}${start+3}`).formulas=[[`=${cc}${start+1}*'Assumptions'!$${ac}$17+${cc}${start+2}*'Assumptions'!$${ac}$18`]];
    scenarios.getRange(`${cc}${start+4}`).formulas=[[`=(${cc}${start+1}*'Assumptions'!$${ac}$19+${cc}${start+2}*'Assumptions'!$${ac}$20)*'Assumptions'!$${ac}$21+${cc}${start+3}*'Assumptions'!$${ac}$23+(${cc}${start+1}+${cc}${start+2})*'Assumptions'!$${ac}$22`]];
    scenarios.getRange(`${cc}${start+5}`).formulas=[[`='Assumptions'!$${ac}$25*(1+'Assumptions'!$${ac}$26)^(${m}-1)+'Assumptions'!$${ac}$27+IF(${m}>='Assumptions'!$${ac}$29,'Assumptions'!$${ac}$28,0)+IF(${m}>='Assumptions'!$${ac}$31,'Assumptions'!$${ac}$30,0)+'Assumptions'!$${ac}$32*(1+'Assumptions'!$${ac}$33)^(${m}-1)+'Assumptions'!$${ac}$34`]];
    scenarios.getRange(`${cc}${start+6}`).formulas=[[`=${cc}${start+3}-${cc}${start+4}-${cc}${start+5}`]];
    scenarios.getRange(`${cc}${start+7}`).formulas=[[`=IF(${m}='Assumptions'!$${ac}$37,'Assumptions'!$${ac}$36,0)`]];
    scenarios.getRange(`${cc}${start+8}`).formulas=[[i===0?`='Assumptions'!$${ac}$35+${cc}${start+6}+${cc}${start+7}`:`=${prev}${start+8}+${cc}${start+6}+${cc}${start+7}`]];
  }
  scenarios.getRange(`B${start+1}:AK${start+2}`).format.numberFormat=countFmt; scenarios.getRange(`B${start+3}:AK${start+8}`).format.numberFormat=moneyFmt;
  const outRow=5+s;
  scenarios.getRange(`B${outRow}`).formulas=[[`=SUM(B${start+3}:M${start+3})`]]; scenarios.getRange(`C${outRow}`).formulas=[[`=SUM(N${start+3}:Y${start+3})`]]; scenarios.getRange(`D${outRow}`).formulas=[[`=SUM(Z${start+3}:AK${start+3})`]]; scenarios.getRange(`E${outRow}`).formulas=[[`=AK${start+3}`]]; scenarios.getRange(`F${outRow}`).formulas=[[`=MIN(B${start+8}:AK${start+8})`]]; scenarios.getRange(`G${outRow}`).formulas=[[`=AK${start+8}`]];
}
scenarios.getRange("B5:G7").format.numberFormat=moneyFmt; scenarios.getRange("A5:G7").format.borders={preset:"inside",style:"thin",color:border}; scenarios.getRange("A6:G6").format.fill=paleBlue;
setWidths(scenarios,[["A:A",24],["B:G",16],["H:AK",12]]); scenarios.freezePanes.freezeRows(4); scenarios.freezePanes.freezeColumns(1);

// CHECKS
title(checks,"A1:G1","Model Checks","A2:G2","Each check should show OK. Failures identify where to review assumptions or formulas.");
checks.getRange("A3:B3").values=[["MODEL STATUS",null]]; checks.getRange("B3").formulas=[["=IF(COUNTIF(F6:F11,\"OK\")=6,\"PASS\",\"FAIL\")"]]; checks.getRange("A3:B3").format={fill:paleGreen,font:{bold:true},borders:{preset:"outside",style:"thin",color:border}};
checks.getRange("A5:G5").values=[["Check","Actual","Expected","Difference","Tolerance","Status","Where to fix / notes"]]; checks.getRange("A5:G5").format={fill:"#DCE5F2",font:{bold:true}};
const checkRows=[
 ["Revenue equals B2C + B2B", "=ABS(SUM('Forecast'!B32:AK32)-SUM('Forecast'!B30:AK30)-SUM('Forecast'!B31:AK31))",0,"=B6-C6",0.01,"=IF(ABS(D6)<=E6,\"OK\",\"FAIL\")","Forecast rows 30–32"],
 ["Gross profit equals revenue less COGS", "=ABS(SUM('Forecast'!B45:AK45)-SUM('Forecast'!B32:AK32)+SUM('Forecast'!B44:AK44))",0,"=B7-C7",0.01,"=IF(ABS(D7)<=E7,\"OK\",\"FAIL\")","Forecast rows 32, 44–45"],
 ["Operating profit ties", "=ABS(SUM('Forecast'!B56:AK56)-SUM('Forecast'!B45:AK45)+SUM('Forecast'!B55:AK55))",0,"=B8-C8",0.01,"=IF(ABS(D8)<=E8,\"OK\",\"FAIL\")","Forecast rows 45, 55–56"],
 ["Cash roll-forward ties", "=ABS('Forecast'!AK62-'Assumptions'!F35-SUM('Forecast'!B60:AK60)-SUM('Forecast'!B61:AK61))",0,"=B9-C9",0.01,"=IF(ABS(D9)<=E9,\"OK\",\"FAIL\")","Forecast rows 59–62"],
 ["Gross margin stays between 0% and 100%", "=MIN('Forecast'!B46:AK46)",0,"=IF(AND(B10>=C10,B10<=E10),0,1)",1,"=IF(D10=0,\"OK\",\"FAIL\")","Assumptions: pricing and usage costs"],
 ["Selected scenario is valid", "=COUNTIF('Assumptions'!B4,\"Conservative\")+COUNTIF('Assumptions'!B4,\"Base\")+COUNTIF('Assumptions'!B4,\"Upside\")",1,"=B11-C11",0,"=IF(ABS(D11)<=E11,\"OK\",\"FAIL\")","Assumptions!B4"]
];
checks.getRange("A6:G11").values=checkRows.map(r=>[r[0],null,r[2],null,r[4],null,r[6]]);
for(let i=0;i<checkRows.length;i++){let r=6+i; checks.getRange(`B${r}`).formulas=[[checkRows[i][1]]]; checks.getRange(`D${r}`).formulas=[[checkRows[i][3]]]; checks.getRange(`F${r}`).formulas=[[checkRows[i][5]]];}
checks.getRange("B6:E11").format.numberFormat="0.000";
checks.getRange("F6:F11").conditionalFormats.add("containsText",{text:"OK",format:{fill:paleGreen,font:{color:"#087A55",bold:true}}}); checks.getRange("F6:F11").conditionalFormats.add("containsText",{text:"FAIL",format:{fill:paleRed,font:{color:"#B42318",bold:true}}});
setWidths(checks,[["A:A",38],["B:F",14],["G:G",42]]);

// SOURCES
title(sources,"A1:H1","Sources & Model Notes","A2:H2","The current workbook uses internal planning assumptions because no historical operating data was provided.");
sources.getRange("A4:H4").values=[["Item","Value","Units","As of","Source type","Source / reference","Owner","Notes"]]; sources.getRange("A4:H4").format={fill:"#DCE5F2",font:{bold:true}};
const sourceRows=[
 ["Product definition","AI investor-style pitch practice","n/a","2026-07-13","Project documentation","Local README.md and application copy","Founder","Upload a pitch and deck; receive scores, questions, valuation framing, and next milestones."],
 ["Revenue model","B2C subscription + B2B program account","n/a","2026-07-13","Planning assumption","Internal model design","Founder","Designed to test both founder self-serve and accelerator/university partnership channels."],
 ["Acquisition assumptions","Scenario-specific","monthly","2026-07-13","Planning assumption","Assumptions sheet","Founder","Replace with website, signup, conversion, and churn data after beta launch."],
 ["Pricing assumptions","Scenario-specific","USD/month","2026-07-13","Planning assumption","Assumptions sheet","Founder","Test willingness to pay before treating these as targets."],
 ["AI and infrastructure costs","Scenario-specific","USD/usage","2026-07-13","Planning assumption","Assumptions sheet","Founder","Update using actual OpenAI, storage, hosting, and payment processor invoices."],
 ["Operating expenses","Scenario-specific","USD/month","2026-07-13","Planning assumption","Assumptions sheet","Founder","Founder payroll and support hiring are controlled by start-month assumptions."],
 ["Forecast period","Aug 2026–Jul 2029","36 months","2026-07-13","Model convention","Forecast sheet","Founder","Monthly model, USD, no taxes, debt, depreciation, or working capital assumed at MVP stage."]
];
sources.getRange("A5:H11").values=sourceRows; sources.getRange("A5:H11").format.wrapText=true; sources.getRange("D5:D11").format.numberFormat="yyyy-mm-dd"; sources.getRange("A13:H15").merge(true); sources.getRange("A13:A15").values=[["Important: This is a planning model, not a valuation or financial forecast based on historical evidence."],["Update the blue assumption cells as beta data arrives. Prioritize conversion, churn, reports per account, AI cost per report, and willingness to pay."],["Taxes, capitalized software, working capital, debt, and depreciation are intentionally excluded for an early MVP cash-planning view."]]; sources.getRange("A13:H15").format={fill:paleGold,font:{color:"#7A5B00"},wrapText:true};
setWidths(sources,[["A:A",26],["B:B",24],["C:E",14],["F:F",28],["G:G",16],["H:H",54]]);

// Common polish
for(const sh of [summary,assumptions,forecast,scenarios,checks,sources]){
  const used=sh.getUsedRange(); used.format.font={ name:"Aptos", size:10 };
  used.format.verticalAlignment="center";
}
// Reapply prominent title styling after base font pass
for(const [sh,rg] of [[summary,"A1:L1"],[assumptions,"A1:F1"],[forecast,"A1:AK1"],[scenarios,"A1:J1"],[checks,"A1:G1"],[sources,"A1:H1"]]) sh.getRange(rg).format.font={name:"Aptos Display",size:20,bold:true,color:"#FFFFFF"};

const inspectSummary = await wb.inspect({kind:"table",range:"Summary!A1:L34",include:"values,formulas",tableMaxRows:40,tableMaxCols:12,maxChars:9000});
console.log(inspectSummary.ndjson);
const inspectChecks = await wb.inspect({kind:"table",range:"Checks!A1:G12",include:"values,formulas",tableMaxRows:15,tableMaxCols:8,maxChars:5000});
console.log(inspectChecks.ndjson);
const errors = await wb.inspect({kind:"match",searchTerm:"#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",options:{useRegex:true,maxResults:300},summary:"final formula error scan",maxChars:5000});
console.log(errors.ndjson);

for(const [name,range] of [["Summary","A1:L35"],["Assumptions","A1:F37"],["Forecast","A1:P64"],["Forecast","Q1:AK64"],["Scenarios","A1:J55"],["Checks","A1:G12"],["Sources","A1:H15"]]){
  const img=await wb.render({sheetName:name,range,scale:1.15,format:"png"});
  await fs.writeFile(`${previewDir}/${name.toLowerCase()}-${range.replace(/[:]/g,"-")}.png`,new Uint8Array(await img.arrayBuffer()));
}

const out = await SpreadsheetFile.exportXlsx(wb);
await out.save(`${outputDir}/AI_Shark_Tank_Financial_Model.xlsx`);
console.log(`SAVED ${outputDir}/AI_Shark_Tank_Financial_Model.xlsx`);
