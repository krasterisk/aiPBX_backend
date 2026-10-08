import socket,urllib.request
print('Telegram DNS families:',sorted(set(x[0].name for x in socket.getaddrinfo('api.telegram.org',443))))
