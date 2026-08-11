import socket

# Configuração do servidor
server_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
server_socket.bind(('localhost', 12345))

print("Servidor UDP aguardando mensagem...")

# Recebendo dados do cliente
data, addr = server_socket.recvfrom(1024)
print(f"Mensagem recebida: {data.decode()} de {addr}")

# Enviando resposta
server_socket.sendto("Mensagem recebida".encode(), addr)
server_socket.close()
