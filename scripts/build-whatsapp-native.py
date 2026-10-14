"""Build the branded, native Meta Flow; no client-side quotes or bank fixtures."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json,base64,os
root=Path(__file__).resolve().parent.parent
brand=root/'public/whatsapp-flows/brand';brand.mkdir(exist_ok=True)
im=Image.new('RGB',(960,240),'#1455db');draw=ImageDraw.Draw(im)
fonts=[os.environ.get('BRASPER_FLOW_FONT',''),'/System/Library/Fonts/SFNS.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']
font=next((f for f in fonts if f and Path(f).is_file()),None)
if not font: raise RuntimeError('Configura BRASPER_FLOW_FONT con una fuente TrueType disponible.')
big=ImageFont.truetype(font,86);small=ImageFont.truetype(font,26);pill=ImageFont.truetype(font,22)
draw.rounded_rectangle((30,30,930,210),radius=30,fill='#174dc5')
draw.text((58,52),'brasper',font=big,fill='white');draw.ellipse((387,113,401,127),fill='#a7ebff')
draw.text((63,153),'TU CAMBIO, MÁS CERCA.',font=small,fill='#cfddff')
draw.rounded_rectangle((627,72,898,130),radius=28,fill='#e8f0ff')
draw.text((648,87),'PERÚ  ↔  BRASIL',font=pill,fill='#1645a3')
for x in (679,733,787):draw.ellipse((x,158,x+12,170),fill='#78b4ff')
im.save(brand/'flow-header.png',optimize=True)
image=base64.b64encode((brand/'flow-header.png').read_bytes()).decode()
steps=['QUOTE','CUSTOMER','FUNDS','DESTINATION','BILLING','REVIEW','PAYMENT']
labels={'QUOTE':'Cotiza tu cambio','CUSTOMER':'Tus datos','FUNDS':'Origen de fondos','DESTINATION':'Cuenta de destino','BILLING':'Tu comprobante','REVIEW':'Revisa tu cambio','PAYMENT':'Pago y comprobante'}
fields={
'QUOTE':[('route','Dropdown','Monedas',[('PEN_BRL','Soles → Reales'),('BRL_PEN','Reales → Soles')]),('amount','TextInput','Monto a cambiar','number')],
'CUSTOMER':[('customer_name','TextInput','Nombre completo',None),('customer_document_type','Dropdown','Documento','identity_options'),('customer_document','TextInput','Número de documento',None),('billing_email','TextInput','Correo de envío','email')],
'FUNDS':[('origin_bank','TextInput','Banco de origen',None),('funds_origin','Dropdown','Origen de fondos',[('salary','Sueldo o trabajo'),('savings','Ahorros'),('business','Negocio'),('sale','Venta de bienes'),('loan','Préstamo'),('family','Apoyo familiar'),('other','Otro origen')]),('funds_detail','TextArea','Detalle del origen',None),('transfer_purpose','TextArea','Motivo del cambio',None),('recipient_relationship','TextInput','Relación con destino',None)],
'DESTINATION':[('recipient_name','TextInput','Destinatario',None),('recipient_document','TextInput','Documento destino',None),('recipient_bank','TextInput','Banco de destino',None),('recipient_account_type','Dropdown','Tipo de cuenta','account_options'),('recipient_account','TextInput','Cuenta, CCI o PIX',None),('recipient_account_holder','TextInput','Titular de la cuenta',None),('recipient_account_holder_document','TextInput','Documento titular',None),('recipient_bank_branch','TextInput','Agencia bancaria',None),('recipient_phone','TextInput','Teléfono destino','phone')],
'BILLING':[('billing_type','Dropdown','Comprobante','billing_options'),('billing_legal_name','TextInput','Nombre o empresa',None),('billing_document_type','Dropdown','Documento fiscal','billing_document_options'),('billing_document','TextInput','Número fiscal',None)],
'REVIEW':[], 'PAYMENT':[('bank_reference','TextInput','Número de operación',None)]}
optional={'funds_detail','recipient_bank_branch','recipient_phone','billing_legal_name','billing_document_type','billing_document'}
strings=['quote_summary','customer_summary','recipient_summary','billing_summary','payment_instructions','error_message']
alloptions=['identity_options','account_options','billing_options','billing_document_options']
screens=[]
for ix,screen in enumerate(steps):
 example_text={'quote_summary': 'Cotiza tu cambio para consultar la tasa y el monto neto.', 'customer_summary': 'Completa tu nombre y documento.', 'recipient_summary': 'Completa el destinatario y su cuenta receptora.', 'billing_summary': 'Completa el correo y los datos del comprobante.', 'payment_instructions': 'Las cuentas de ingreso se mostrarán con la cotización vigente.', 'error_message': 'Revisa los datos antes de continuar.'}
 data={k:{'type':'string','__example__':example_text[k]} for k in strings}
 data['has_error']={'type':'boolean','__example__':False}
 example_options={'identity_options':[{'id':'1','title':'DNI'}],'account_options':[{'id':'pix','title':'Clave PIX'}],'billing_options':[{'id':'nfse','title':'Nota fiscal'}],'billing_document_options':[{'id':'cpf','title':'CPF'}]}
 for opt in alloptions:data[opt]={'type':'array','items':{'type':'object','properties':{'id':{'type':'string'},'title':{'type':'string'}}},'__example__':example_options[opt]}
 children=[{'type':'Image','src':image,'height':88,'aspect-ratio':4,'scale-type':'contain','alt-text':'Brasper · Perú y Brasil'}, {'type':'TextCaption','text':f'BRASPER / PASO {ix+1} DE 7'}, {'type':'TextHeading','text':labels[screen]}, {'type':'TextBody','text':'Revisa los datos de este paso. Si acabas de abrir el formulario, solicita un nuevo acceso desde el chat.','visible':'${data.has_error}'}]
 if screen!='QUOTE':children.append({'type':'TextBody','text':'${data.quote_summary}'})
 if screen=='QUOTE':children.append({'type':'TextBody','text':'Entre soles y reales, con todo claro antes de enviar. Consulta la tasa y el monto que recibirá tu destinatario.'})
 if screen=='FUNDS':children.append({'type':'TextBody','text':'Cuéntanos de dónde proviene el dinero y para qué realizas el cambio. Si eliges otro origen, completa su detalle.'})
 if screen=='BILLING':children.append({'type':'TextBody','text':'El comprobante corresponde al país donde recibe tu destinatario. Para factura o nota fiscal, completa el receptor y su documento fiscal.'})
 if screen=='REVIEW':
  for title,key in [('Tú','customer_summary'),('Destinatario','recipient_summary'),('Comprobante','billing_summary')]:children.extend([{'type':'TextSubheading','text':title},{'type':'TextBody','text':'${data.'+key+'}'}])
 if screen=='PAYMENT':children.extend([{'type':'TextSubheading','text':'Cuenta de Brasper'},{'type':'TextBody','text':'${data.payment_instructions}'},{'type':'TextBody','text':'Adjunta una foto o un PDF y el número de operación. El equipo verificará el ingreso antes de enviar el dinero.'}])
 form=[];payload={};init={}
 for key,typ,label,arg in fields[screen]:
  examples={'route':'PEN_BRL','amount':'300','customer_document_type':'1','funds_origin':'savings','recipient_account_type':'pix','billing_type':'nfse','billing_document_type':'cpf'}
  data[key]={'type':'number' if key=='amount' else 'string','__example__':300 if key=='amount' else examples.get(key,'')}
  f={'type':typ,'name':key,'label':label,'required':key not in optional}
  if typ=='Dropdown':f['data-source']=[{'id':a,'title':b}for a,b in arg] if isinstance(arg,list) else '${data.'+arg+'}'
  if typ=='TextInput' and arg:f['input-type']=arg
  if typ=='TextArea':f['max-length']=500
  if key=='amount':f['helper-text']='Hasta 2 decimales.'
  form.append(f);payload[key]='${form.'+key+'}'
  if key!='amount':init[key]='${data.'+key+'}'
 if screen=='PAYMENT':
  form.extend([{'type':'DocumentPicker','name':'document_picker','label':'Comprobante de pago','description':'Elige una foto JPG/PNG o un PDF desde la galería o archivos.','min-uploaded-documents':1,'max-uploaded-documents':1,'max-file-size-kb':5120,'allowed-mime-types':['image/jpeg','image/png','application/pdf']},{'type':'OptIn','name':'declaration','label':'Confirmo que los datos son correctos y que tengo autorización para usar las cuentas indicadas.','required':True}])
  payload.update({key:'${form.'+key+'}'for key in ['document_picker','declaration']})
 form.append({'type':'Footer','label':'Enviar a revisión' if screen=='PAYMENT' else 'Ver mi cotización' if screen=='QUOTE' else 'Confirmar datos' if screen=='REVIEW' else 'Continuar','on-click-action':{'name':'data_exchange','payload':payload}})
 children.append({'type':'Form','name':'form','init-values':init,'children':form})
 screens.append({'id':screen,'title':'Brasper · '+labels[screen],'terminal':screen=='PAYMENT','data':data,'layout':{'type':'SingleColumnLayout','children':children}})
flow={'version':'7.3','data_api_version':'3.0','routing_model':{s:([steps[i+1]]if i<len(steps)-1 else []) for i,s in enumerate(steps)},'screens':screens}
(root/'public/whatsapp-flows/brasper-native.json').write_text(json.dumps(flow,ensure_ascii=False,indent=2)+'\n')
print('Flow nativo generado: 7 pantallas, imagen Brasper y datos de backend.')
