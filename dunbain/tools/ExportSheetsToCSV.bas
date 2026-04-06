Attribute VB_Name = "ExportSheetsToCSV"
' Excel: 標準モジュールにインポート → ExportAllSheetsToCSV を実行
' 出力: ブックと同じフォルダに「ブック名_csv」フォルダ
'
' 「パイロットランク表.csv にアクセスできません」対策:
'   - 出力フォルダの作成を確認
'   - 既存 CSV が開いていたら閉じる / 上書き前に削除を試みる
'   - UTF-8(62) が失敗したら xlCSV(6) にフォールバック

Option Explicit

' ファイル形式（環境によって定数が無い場合があるので数値も使う）
Private Const fmtUTF8 As Long = 62      ' xlCSVUTF8（Excel 2016 / 365 以降）
Private Const fmtCSV As Long = 6        ' xlCSV

Private Function SafeFileName(ByVal s As String) As String
    Dim i As Long, ch As String, bad As String
    bad = "/\:*?""<>|"
    s = Trim$(s)
    If Len(s) = 0 Then s = "sheet"
    For i = 1 To Len(bad)
        ch = Mid$(bad, i, 1)
        s = Replace(s, ch, "_")
    Next i
    SafeFileName = Left$(s, 120)
End Function

Private Function FolderExists(ByVal folderPath As String) As Boolean
    On Error GoTo EH
    FolderExists = ((GetAttr(folderPath) And vbDirectory) = vbDirectory)
    Exit Function
EH:
    FolderExists = False
End Function

Private Sub EnsureFolder(ByVal folderPath As String)
    If FolderExists(folderPath) Then Exit Sub
    MkDir folderPath
End Sub

Private Sub TryDeleteFile(ByVal fullPath As String)
    On Error Resume Next
    If Len(Dir(fullPath)) > 0 Then Kill fullPath
    On Error GoTo 0
End Sub

Private Sub SaveActiveBookAsCsv(ByVal fullPath As String)
    On Error Resume Next
    ActiveWorkbook.SaveAs Filename:=fullPath, FileFormat:=fmtUTF8, Local:=True
    If Err.Number = 0 Then Exit Sub
    Err.Clear
    ActiveWorkbook.SaveAs Filename:=fullPath, FileFormat:=fmtCSV, Local:=True
    If Err.Number <> 0 Then Err.Raise Err.Number, , Err.Description
End Sub

Public Sub ExportAllSheetsToCSV()
    Dim basePath As String, outDir As String, stem As String
    Dim ws As Worksheet
    Dim fullPath As String
    Dim okCount As Long

    stem = Left$(ThisWorkbook.Name, InStrRev(ThisWorkbook.Name, ".") - 1)
    If stem = "" Then stem = ThisWorkbook.Name
    basePath = ThisWorkbook.Path
    If Len(basePath) = 0 Then
        MsgBox "先にブックを保存してください（保存先フォルダが決まっていないと出力できません）。", vbExclamation
        Exit Sub
    End If

    outDir = basePath & Application.PathSeparator & stem & "_csv"
    On Error GoTo MkDirFail
    EnsureFolder outDir
    On Error GoTo 0

    If Not FolderExists(outDir) Then
        MsgBox "出力フォルダを作成できませんでした。" & vbCrLf & outDir, vbCritical
        Exit Sub
    End If

    Application.ScreenUpdating = False
    Application.DisplayAlerts = False
    okCount = 0

    For Each ws In ThisWorkbook.Worksheets
        fullPath = outDir & Application.PathSeparator & SafeFileName(ws.Name) & ".csv"
        On Error GoTo SheetFail
        ws.Copy
        TryDeleteFile fullPath
        SaveActiveBookAsCsv fullPath
        ActiveWorkbook.Close SaveChanges:=False
        okCount = okCount + 1
        On Error GoTo 0
    Next ws

    Application.DisplayAlerts = True
    Application.ScreenUpdating = True
    MsgBox "完了: " & okCount & " シートを出力しました。" & vbCrLf & outDir, vbInformation
    Exit Sub

MkDirFail:
    MsgBox "フォルダ作成エラー: " & Err.Description & vbCrLf & outDir, vbCritical
    Application.DisplayAlerts = True
    Application.ScreenUpdating = True
    Exit Sub

SheetFail:
    Application.DisplayAlerts = True
    Application.ScreenUpdating = True
    MsgBox "このシートで失敗しました: " & ws.Name & vbCrLf & fullPath & vbCrLf & vbCrLf _
        & "Err " & Err.Number & ": " & Err.Description & vbCrLf & vbCrLf _
        & "・同名の CSV を Excel や他アプリで閉じてから再実行" & vbCrLf _
        & "・iCloud/ネットワーク上のブックなら、デスクトップ等にコピーしてから試す" & vbCrLf _
        & "・Mac ならターミナルで python3 dunbain/tools/xlsx_sheets_to_csv.py も可", _
        vbCritical
End Sub
