import pypdf

reader = pypdf.PdfReader("KL1.pdf")
outlines = reader.outline  # trả về list rỗng [] nếu không có
print((outlines))  # True = có mục lục