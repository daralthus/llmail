import email
import os
from email.header import decode_header
from bs4 import BeautifulSoup
from imapclient import IMAPClient

class Inbox:
    def __init__(self, username, password, mailbox="INBOX"):
        self.mail = IMAPClient("imap.gmail.com", use_uid=True)
        self.mail.login(username, password)
        self.mail.select_folder(mailbox)
    
    def get_headers(self, email_message):
        headers = {}
        for key, value in dict(email_message._headers).items():
            header_tuple = decode_header(value)[0]
            if header_tuple[1] is not None:  # If charset is not None
                headers[key] = header_tuple[0].decode(header_tuple[1])
            else:
                headers[key] = header_tuple[0]
        return headers
    
    def get_payload(self, email_message):
      html_text = ""
      plain_text = ""
      payloads = email_message.get_payload()
      
      if not isinstance(payloads, list):
        payloads = str(payloads)
        if payloads.startswith('<!DOCTYPE') or payloads.startswith('<html'):
          plain_text = BeautifulSoup(payloads, "html.parser").get_text()
        else: 
          plain_text = payloads
        return {"html_text": html_text, "plain_text":plain_text}
      
      for payload in payloads:
          payload_headers = dict(payload._headers)
          if payload_headers.get('Content-Type', '').startswith('text/html'):
              html_text = payload.get_payload(decode=True)
          elif payload_headers.get('Content-Type', '').startswith('multipart'):
              return self.get_payload(payload)
          elif payload_headers.get('Content-Type', '').startswith('text/plain'):
              plain_text = payload.get_payload(decode=True)
              plain_text = str(plain_text)
              if plain_text.startswith('<!DOCTYPE') or plain_text.startswith('<html'):
                plain_text = BeautifulSoup(plain_text, "html.parser").get_text()
      
      if len(plain_text) == 0 and len(html_text) > 0:
         plain_text = BeautifulSoup(html_text, "html.parser").get_text()
      
      return {"html_text": html_text, "plain_text":plain_text}

    def fetch_latest(self, num_emails=10):
        messages = self.mail.search('ALL')
        latest_messages = messages[-num_emails:]
        response = self.mail.fetch(latest_messages, ['BODY[]', 'FLAGS', 'X-GM-LABELS', 'X-GM-MSGID', 'X-GM-THRID', 'INTERNALDATE'])
        
        emails = []
        for msgid, data in response.items():
            email_message = email.message_from_bytes(data[b'BODY[]'])
            headers = self.get_headers(email_message)
            subject = headers.get('Subject', '')
            from_header = headers.get('From', '')
            labels = data[b'X-GM-LABELS']
            flags = data[b'FLAGS']
            gmail_message_id = data[b'X-GM-MSGID']
            gmail_thread_id = data[b'X-GM-THRID']
            date = data[b'INTERNALDATE']
            payload = self.get_payload(email_message)
            emails.append({
              'id': msgid, 
              'from': from_header, 
              'subject': subject, 
              'labels': labels, 
              'flags': flags,
              'html_text': payload.get('html_text', ''),
              'plain_text': payload.get('plain_text', ''),
              'gmail_message_id': gmail_message_id,
              'gmail_thread_id': gmail_thread_id,
              'date': date
            })
        return emails

    def fetch_id(self, id):
        message = self.mail.fetch([id], ['BODY[]', 'FLAGS', 'X-GM-LABELS', 'X-GM-MSGID', 'X-GM-THRID', 'INTERNALDATE'])
        
        for msgid, data in message.items():
            email_message = email.message_from_bytes(data[b'BODY[]'])
            headers = self.get_headers(email_message)
            subject = headers.get('Subject', '')
            from_header = headers.get('From', '')
            labels = data[b'X-GM-LABELS']
            flags = data[b'FLAGS']
            gmail_message_id = data[b'X-GM-MSGID']
            gmail_thread_id = data[b'X-GM-THRID']
            date = data[b'INTERNALDATE']
            payload = self.get_payload(email_message)
            mail = {
              'id': msgid, 
              'from': from_header, 
              'subject': subject, 
              'labels': labels, 
              'flags': flags,
              'html_text': payload.get('html_text', ''),
              'plain_text': payload.get('plain_text', ''),
              'gmail_message_id': gmail_message_id,
              'gmail_thread_id': gmail_thread_id,
              'date': date
            }
        return mail
    
    def fetch_thread(self, gmail_thread_id):
      folders = ['INBOX', '[Gmail]/Sent Mail']
      thread_emails = []
      for folder in folders:
          self.mail.select_folder(folder)
          thread = self.mail.search('X-GM-THRID %s' % gmail_thread_id)
          for id in thread:
              email_data = self.fetch_id(id)
              thread_emails.append(email_data)
      self.mail.select_folder('INBOX')
      thread_emails.sort(key=lambda x: x['date'], reverse=True)
      return thread_emails
    
   

def main():
  username = os.getenv("MAIL_USER")
  password = os.getenv("MAIL_PASS")
  inbox = Inbox(username, password)

  # fetch the latest 10 emails
  latest_emails = inbox.fetch_latest(40)
  print(latest_emails)
  
  # fetch a thread
  thread = inbox.fetch_thread(1774829923740842122)
  print('thread', thread)
  latest_email = inbox.fetch_id(latest_emails[0]["id"])
  print('latest_email', latest_email)
  
if __name__ == "__main__":
    main()
