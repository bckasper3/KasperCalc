VERSION 5.00
Begin {C62A69F0-16DC-11CE-9E98-00AA00574A4F} UserForm1 
   Caption         =   "Spring Generator Input Data Form"
   ClientHeight    =   6855
   ClientLeft      =   120
   ClientTop       =   465
   ClientWidth     =   5400
   OleObjectBlob   =   "UserForm1.frx":0000
   StartUpPosition =   1  'CenterOwner
End
Attribute VB_Name = "UserForm1"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False
Public FormSubmitted As Boolean

Private Sub CommandButton1_Click()
    FormSubmitted = True
    Me.Hide
End Sub

Private Sub cmbCSendType_Change()

End Sub

Private Sub CompressionSpring_Click()

End Sub

Private Sub Image1_BeforeDragOver(ByVal Cancel As MSForms.ReturnBoolean, ByVal Data As MSForms.DataObject, ByVal X As Single, ByVal Y As Single, ByVal DragState As MSForms.fmDragState, ByVal Effect As MSForms.ReturnEffect, ByVal Shift As Integer)

End Sub

Private Sub Image2_BeforeDragOver(ByVal Cancel As MSForms.ReturnBoolean, ByVal Data As MSForms.DataObject, ByVal X As Single, ByVal Y As Single, ByVal DragState As MSForms.fmDragState, ByVal Effect As MSForms.ReturnEffect, ByVal Shift As Integer)

End Sub

Private Sub Label10_Click()

End Sub

Private Sub Label11_Click()

End Sub

Private Sub Image4_BeforeDragOver(ByVal Cancel As MSForms.ReturnBoolean, ByVal Data As MSForms.DataObject, ByVal X As Single, ByVal Y As Single, ByVal DragState As MSForms.fmDragState, ByVal Effect As MSForms.ReturnEffect, ByVal Shift As Integer)

End Sub

Private Sub Label14_Click()

End Sub

Private Sub Label15_Click()

End Sub

Private Sub Label16_Click()

End Sub

Private Sub Label2_Click()

End Sub

Private Sub Label3_Click()

End Sub

Private Sub Label20_Click()

End Sub

Private Sub Label21_Click()

End Sub

Private Sub Label22_Click()

End Sub

Private Sub Label6_Click()

End Sub

Private Sub Label8_Click()

End Sub

Private Sub OptionButton1_Click()

End Sub

Private Sub OptionButton2_Click()

End Sub

Private Sub OptionButton3_Click()

End Sub

Private Sub TextBox5_Change()

End Sub

Private Sub LHWind_Click()

End Sub

Private Sub NewPart_Click()

End Sub

Private Sub TSangle_Change()

End Sub

Private Sub txtmeandia_Change()

End Sub

Private Sub txtnumcoils_Change()

End Sub


Private Sub cmdOK_Click()
    ' On clicking OK, set the FormSubmitted flag and hide the form
    FormSubmitted = True
    Me.Hide
End Sub

Private Sub cmdCancel_Click()
    ' On clicking Cancel, set the FormSubmitted flag to False and hide the form
    FormSubmitted = False
    Me.Hide
End Sub

Private Sub txtwiredia_Change()

End Sub

Private Sub UserForm_Initialize()
    cmbCSendType.Clear
    cmbCSendType.AddItem "Open"
    cmbCSendType.AddItem "Open and ground"
    cmbCSendType.AddItem "Closed not ground"
    cmbCSendType.AddItem "Closed and ground"
    cmbCSendType.ListIndex = 3 ' Default selection
End Sub

