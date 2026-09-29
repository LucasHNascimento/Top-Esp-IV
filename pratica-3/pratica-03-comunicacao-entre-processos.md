# Prática 03: serialização, semânticas de entrega, REST e mensageria

**Disciplina:** Tópicos Especiais IV (Computação Distribuída)
**Curso:** Bacharelado em Sistemas de Informação, UNIPAM

A Prática 02 terminou com duas perguntas em aberto. A primeira apareceu no quadro de síntese: no
soquete, quem separa uma mensagem da seguinte é o próprio programador, e a prática não mostrou como
isso se faz. A segunda apareceu no tempo limite do protocolo UDP: quando a resposta não chega, o
cliente não sabe se o pedido se perdeu no caminho ou se foi executado e a resposta é que se perdeu.

Esta prática trata das duas. A primeira parte estuda como um dado sai da memória de um processo e
atravessa a rede na forma de bytes, e como o processo que recebe reconstrói o dado e reconhece onde
cada mensagem termina. A segunda parte estuda o que o cliente pode fazer diante da ausência de
resposta, e por que a decisão de reenviar um pedido depende da natureza da operação pedida.

As duas partes seguintes levam as mesmas questões a duas formas de comunicação usadas na prática
profissional. A terceira parte estuda o estilo REST, em que o serviço expõe recursos sobre o HTTP e
a idempotência passa a fazer parte da semântica de cada método. A quarta estuda a comunicação
assíncrona por filas de mensagens, em que produtor e consumidor deixam de precisar existir ao mesmo
tempo, e em que a entrega repetida volta a aparecer.

As quatro partes usam as mesmas duas máquinas virtuais da Prática 02, com os mesmos endereços.

---

## Sumário

| Seção | Assunto |
|---|---|
| Quadro de referência | endereços, portas e diretórios |
| 1 | Serialização de dados: fundamentação |
| 2 | Preparação do ambiente |
| 3 | Serialização de dados: atividade |
| 4 | Semânticas de entrega: fundamentação |
| 5 | Semânticas de entrega: atividade |
| 6 | REST: fundamentação |
| 7 | REST: atividade |
| 8 | Comunicação assíncrona e mensageria: fundamentação |
| 9 | Comunicação assíncrona e mensageria: atividade |
| 10 | Síntese |
| 11 | Questões para estudo |
| 12 | Referência de comandos |
| 13 | Diagnóstico de falhas |
| 14 | Apêndice com o conteúdo integral dos arquivos |
| | Referência bibliográfica |

---

## Objetivos de aprendizagem

Ao final desta prática o aluno deve ser capaz de:

- Explicar por que um dado precisa ser serializado para atravessar a rede, e o que a
  desserialização exige do processo que recebe
- Comparar um formato textual, o JSON, com um formato binário, quanto ao tamanho, à legibilidade e
  à dependência de um contrato combinado entre as partes
- Explicar o papel da ordem de bytes em um formato binário e reconhecer o efeito de uma ordem
  divergente
- Explicar por que um fluxo TCP não preserva a fronteira entre mensagens e construir o
  enquadramento por prefixo de tamanho
- Enumerar as causas possíveis da ausência de resposta e explicar por que o cliente não consegue
  distingui-las
- Distinguir as semânticas talvez, ao menos uma vez e no máximo uma vez, e relacionar cada uma aos
  mecanismos que a produzem
- Definir operação idempotente com precisão e classificar operações quanto a essa propriedade
- Construir a filtragem de pedidos duplicados e explicar o custo que ela impõe ao servidor
- Explicar o que caracteriza o estilo REST, distinguindo recurso de representação, e descrever as
  suas restrições, em particular a ausência de estado de sessão
- Classificar os métodos do HTTP quanto à segurança e à idempotência, e relacionar essa
  classificação ao reenvio de requisições
- Interpretar as famílias de códigos de resposta do HTTP
- Distinguir comunicação síncrona de assíncrona quanto ao acoplamento no tempo e na referência
- Explicar o papel da fila, da confirmação e da reentrega, e por que um consumidor precisa ser
  idempotente

---

## Quadro de referência

**As máquinas, as mesmas da Prática 02**

| Papel | Nome | Endereço na rede exclusiva de hospedeiro |
|---|---|---|
| serviço | `banco` | 192.168.56.101 |
| cliente | `aplicacao` | 192.168.56.102 |

**As portas desta prática**

| Porta | Protocolo | Onde escuta | Papel |
|---|---|---|---|
| 9100 | TCP | máquina `banco` | serviço de registros, parte de serialização |
| 9200 | UDP | máquina `banco` | serviço da conta, parte de semânticas de entrega |
| 8080 | TCP | máquina `banco` | API REST de contas |
| 9300 | TCP | máquina `banco` | fila de mensagens |

**O diretório de trabalho, nas duas máquinas**

```
/home/SEU_USUARIO/pratica03
```

**Os arquivos, e onde cada um é criado**

| Arquivo | Máquina | Seção do apêndice |
|---|---|---|
| `formatos.py` | `aplicacao` | 14.1 |
| `servidorTexto.py` | `banco` | 14.2 |
| `clienteTexto.py` | `aplicacao` | 14.3 |
| `servidorRegistro.py` | `banco` | 14.4 |
| `clienteRegistro.py` | `aplicacao` | 14.5 |
| `servidorConta.py` | `banco` | 14.6 |
| `clienteConta.py` | `aplicacao` | 14.7 |
| `apiContas.py` | `banco` | 14.8 |
| `fila.py` | `banco` | 14.9 |
| `produtor.py` | `aplicacao` | 14.10 |
| `consumidor.py` | `aplicacao` e `banco` | 14.11 |

---

## 1. Serialização de dados: fundamentação

### 1.1 Do dado na memória ao dado no fio

Dentro de um processo, um registro como a conta de um cliente existe como estrutura de memória. Em
Python, um dicionário com três campos é um objeto que guarda referências para outros objetos, um
número inteiro, um texto e um número real, cada um em uma posição de memória que só faz sentido
dentro daquele processo. Um endereço de memória do processo que envia não significa nada para o
processo que recebe, que está em outra máquina e tem o próprio espaço de endereçamento.

A rede, por sua vez, não transporta objetos. Ela transporta uma sequência de bytes. Para que o
registro atravesse a rede, é preciso convertê-lo em uma sequência de bytes que contenha o
**valor** de cada campo, e não a sua posição na memória. Essa conversão chama-se **serialização**,
ou empacotamento. A operação inversa, que reconstrói a estrutura a partir dos bytes recebidos,
chama-se **desserialização**, ou desempacotamento.

Para que a desserialização funcione, os dois processos precisam concordar sobre a forma dos bytes.
Coulouris chama essa forma combinada de **representação externa de dados**: um padrão acordado
para representar estruturas de dados e valores primitivos durante a transmissão, independente de
como cada máquina os representa internamente. As duas máquinas podem usar linguagens diferentes,
processadores diferentes e sistemas operacionais diferentes. O que elas compartilham é apenas a
representação externa.

Existem duas famílias de representação externa, e as duas são usadas na prática atual: a textual e
a binária.

### 1.2 O formato textual: JSON

O JSON representa o dado como texto legível, com os nomes dos campos escritos ao lado dos valores.

```json
{"numero": 7, "titular": "Ana Souza", "saldo": 1520.75}
```

| Tipo do JSON | Exemplo |
|---|---|
| texto | `"titular": "Ana Souza"` |
| número | `"numero": 7` e `"saldo": 1520.75` |
| lógico | `"ativa": true` |
| nulo | `"encerrada": null` |
| lista | `"telefones": ["3822-0000", "99999-0000"]` |
| objeto aninhado | `"endereco": {"cidade": "Patos de Minas"}` |

A característica central do JSON é ser **autodescritivo**. Cada mensagem carrega os nomes dos
próprios campos, e por isso quem recebe consegue interpretá-la sem conhecer de antemão a estrutura
exata. Um campo novo acrescentado pelo emissor não quebra o receptor, que simplesmente o ignora se
não o conhecer. A mensagem também pode ser lida por uma pessoa, o que facilita o diagnóstico.

O preço dessa autodescrição é o tamanho, porque os nomes dos campos viajam em toda mensagem, e o
custo de processamento, porque converter texto em número exige análise caractere a caractere. O
JSON também tem limitações de tipo: não distingue número inteiro de número real, não tem tipo para
data nem para bytes, e números muito grandes podem perder precisão ao passar por linguagens que os
tratam como ponto flutuante.

### 1.3 O formato binário e o contrato

O formato binário representa cada valor diretamente pelos bytes que o compõem, em posições fixas e
combinadas previamente. Para a mesma conta, um formato possível é:

| Campo | Tipo | Tamanho |
|---|---|---|
| `numero` | inteiro sem sinal | 4 bytes |
| `titular` | texto de tamanho fixo, completado com zeros | 20 bytes |
| `saldo` | número real de precisão dupla | 8 bytes |

A mensagem inteira ocupa 32 bytes, e nenhum deles é nome de campo. O receptor sabe que os quatro
primeiros bytes são o número da conta porque isso foi combinado antes, e não porque a mensagem o
diga. Esse acordo prévio é um **contrato**, e é ele que torna o formato binário compacto e rápido.

O mesmo contrato é a fragilidade do formato. Uma mensagem binária não se descreve, e um receptor que
use um contrato diferente do emissor não percebe o erro: lê os mesmos bytes e obtém valores
errados, sem nenhuma mensagem de falha. Acrescentar um campo exige mudar o contrato dos dois lados
ao mesmo tempo, o que em um sistema distribuído, com máquinas atualizadas em momentos diferentes,
raramente é possível.

Os formatos binários usados na indústria, como o Protocol Buffers, que é o formato do gRPC, resolvem
essa fragilidade com um recurso intermediário: cada campo recebe um número de identificação que
viaja na mensagem, em vez do nome. O receptor que não conhece um número simplesmente o ignora. O
contrato continua existindo, escrito em um arquivo de definição compartilhado pelas partes, mas
passa a admitir evolução. Kleppmann trata essa questão, a evolução de formatos entre versões
diferentes de um mesmo sistema, como o problema central da escolha de uma codificação.

### 1.4 A ordem dos bytes

Um número inteiro de 4 bytes pode ser gravado com o byte mais significativo primeiro ou com o byte
menos significativo primeiro. As duas convenções existem nos processadores, e recebem os nomes de
**big-endian** e **little-endian**. O número 7, em 4 bytes, fica assim em cada uma:

| Ordem | Bytes |
|---|---|
| mais significativo primeiro, big-endian | `00 00 00 07` |
| menos significativo primeiro, little-endian | `07 00 00 00` |

Quando o formato é binário, a ordem dos bytes faz parte do contrato. Os protocolos da internet
adotam o byte mais significativo primeiro, e por isso essa ordem é chamada de **ordem de rede**. Na
atividade, o módulo `struct` do Python recebe a ordem de rede pelo caractere `!` no início da
descrição do formato.

### 1.5 O enquadramento das mensagens

O protocolo TCP entrega um **fluxo** de bytes, e não uma sequência de mensagens. Se o cliente envia
três registros seguidos, o servidor recebe os bytes na ordem certa e sem perda, mas o protocolo não
informa onde termina o primeiro registro e começa o segundo. Uma única chamada de recebimento pode
devolver os três registros juntos, ou metade do primeiro, ou o primeiro e parte do segundo. O
resultado depende do momento em que os bytes chegam, e não da forma como foram enviados.

Por isso, a aplicação que usa TCP precisa marcar a fronteira entre as mensagens. Essa marcação
chama-se **enquadramento**, e há duas formas usuais de fazê-la:

| Forma | Como funciona | Exemplo |
|---|---|---|
| delimitador | um caractere reservado encerra cada mensagem | uma quebra de linha depois de cada JSON |
| prefixo de tamanho | cada mensagem é precedida pelo seu tamanho, em número fixo de bytes | 4 bytes com o tamanho, seguidos da mensagem |

O prefixo de tamanho funciona para qualquer conteúdo, inclusive binário, porque não depende de
reservar um caractere. É a forma usada na atividade. O protocolo UDP não tem esse problema, porque
cada datagrama é entregue inteiro ou não é entregue, e por isso a fronteira de cada mensagem é a
fronteira do próprio datagrama.

No quadro de síntese da Prática 02, a linha "quem separa uma mensagem da seguinte" dizia "o aluno"
no soquete, "o mecanismo" na chamada remota e "o padrão" no HTTP. O enquadramento é o que o
mecanismo da chamada remota e o padrão HTTP fazem sem que o programador precise escrever.

---

## 2. Preparação do ambiente

As duas máquinas virtuais da Prática 02, ligadas. Nada é instalado, e todos os módulos utilizados
pertencem à biblioteca padrão do Python.

Na máquina hospedeira, abrir dois terminais, um para cada máquina:

```bash
ssh SEU_USUARIO@192.168.56.101
```

```bash
ssh SEU_USUARIO@192.168.56.102
```

Conferir em qual máquina cada sessão está:

```bash
hostname -I
```

Em cada uma das duas sessões, criar o diretório de trabalho:

```bash
mkdir -p ~/pratica03
cd ~/pratica03
```

Os arquivos são criados com o editor `nano`, pelo mesmo procedimento das práticas anteriores. O
conteúdo integral de cada arquivo está no apêndice, na seção 14.

---

## 3. Serialização de dados: atividade

### 3.1 O mesmo dado em dois formatos

Na sessão da máquina **`aplicacao`**, criar o arquivo `formatos.py` com o conteúdo da seção 14.1 e
executar:

```bash
python3 formatos.py
```

A saída esperada é:

```
JSON    : 55 bytes
b'{"numero": 7, "titular": "Ana Souza", "saldo": 1520.75}'

Binario : 32 bytes
00 00 00 07 41 6e 61 20 53 6f 75 7a 61 00 00 00 00 00 00 00 00 00 00 00 40 97 c3 00 00 00 00 00

Lido com o formato combinado : 7 Ana Souza 1520.75
Lido com outra ordem de bytes: 117440512 Ana Souza 6.333052e-317
```

Observar três pontos na saída.

**O tamanho.** O mesmo registro ocupa 55 bytes em JSON e 32 em binário. A diferença está nos nomes
dos campos, nas aspas e nos separadores, que o JSON carrega e o binário dispensa.

**O conteúdo dos bytes.** No formato binário, os quatro primeiros bytes, `00 00 00 07`, são o número
7 na ordem de rede. Os vinte seguintes são o texto `Ana Souza` em código de caracteres, completado
com zeros até o tamanho combinado. Os oito últimos são o saldo. Nenhum byte informa qual campo é
qual.

**A leitura com o contrato errado.** A última linha lê os mesmos 32 bytes com a ordem de bytes
invertida. O programa não acusa erro nenhum. O número da conta passa a ser 117.440.512 e o saldo
passa a ser um valor próximo de zero. O texto sai correto, porque um texto é uma sequência de bytes
isolados, e a ordem só afeta valores que ocupam mais de um byte. É o que a seção 1.3 descreveu: no
formato binário, um contrato divergente produz dados errados em silêncio.

### 3.2 Três mensagens em um fluxo, sem enquadramento

Na sessão da máquina **`banco`**, criar o arquivo `servidorTexto.py` com o conteúdo da seção 14.2.
Na sessão da máquina **`aplicacao`**, criar o arquivo `clienteTexto.py` com o conteúdo da seção
10.3.

O cliente envia três registros em JSON pela mesma conexão, um depois do outro. O servidor apresenta
tudo o que cada chamada de recebimento devolve.

Na máquina `banco`:

```bash
python3 servidorTexto.py
```

Na máquina `aplicacao`:

```bash
python3 clienteTexto.py
```

O resultado mais frequente, na máquina `banco`, é uma única linha com os três registros colados:

```
Conexao de ('192.168.56.102', 51234)
  recv devolveu 160 bytes: b'{"numero": 7, ...}{"numero": 8, ...}{"numero": 9, ...}'
```

Os três envios do cliente chegaram como um bloco só. Executar o cliente algumas vezes seguidas. Em
algumas execuções o resultado pode vir dividido de outra forma, e isso confirma a seção 1.5: a
divisão depende do momento de chegada dos bytes, e não dos envios. Para o servidor, é impossível
saber onde termina cada registro sem uma regra combinada, e uma tentativa de converter o bloco
inteiro com `json.loads` falharia com o erro `Extra data`.

Interromper o servidor com `Ctrl+C`.

### 3.3 As mesmas mensagens, com prefixo de tamanho

Na máquina **`banco`**, criar o arquivo `servidorRegistro.py` com o conteúdo da seção 14.4. Na
máquina **`aplicacao`**, criar o arquivo `clienteRegistro.py` com o conteúdo da seção 14.5.

As duas pontas passaram a seguir o mesmo contrato de enquadramento. O cliente, na função
`enviar_mensagem`, envia antes de cada registro 4 bytes com o seu tamanho, em ordem de rede. O
servidor, na função `receber_mensagem`, lê primeiro esses 4 bytes, descobre o tamanho e em seguida
lê exatamente aquela quantidade.

Na máquina `banco`:

```bash
python3 servidorRegistro.py
```

Na máquina `aplicacao`:

```bash
python3 clienteRegistro.py
```

A saída na máquina `banco` apresenta cada registro separado e já convertido em dicionário:

```
Conexao de ('192.168.56.102', 51240)
  recebido: {'numero': 7, 'titular': 'Ana Souza', 'saldo': 1520.75}
  recebido: {'numero': 8, 'titular': 'Bruno Lima', 'saldo': 80.0}
  recebido: {'numero': 9, 'titular': 'Carla Dias', 'saldo': 0.5}
```

Observar a função `receber_exato` no servidor. Ela repete a chamada de recebimento até obter a
quantidade de bytes pedida, porque uma única chamada pode devolver menos do que o pedido. Sem essa
repetição, o enquadramento funcionaria na maior parte das vezes e falharia de forma intermitente,
que é o tipo de defeito mais difícil de diagnosticar em um sistema distribuído.

Interromper o servidor com `Ctrl+C`.

---

## 4. Semânticas de entrega: fundamentação

### 4.1 A ausência de resposta e as suas causas

Na seção 5.6 da Prática 02, o cliente UDP passou a usar um tempo limite. Quando o tempo se esgota
sem resposta, o cliente sabe que algo falhou, mas não sabe **o quê**. Há três possibilidades, e
cada uma deixa o servidor em um estado diferente.

| O que aconteceu | O pedido foi executado? |
|---|---|
| o pedido se perdeu no caminho até o servidor | não |
| o servidor falhou antes de executar, ou durante a execução | não, ou em parte |
| o servidor executou e a resposta se perdeu no caminho de volta | sim |

Do lado do cliente, as três situações são idênticas: o tempo passou e nada chegou. Nenhuma
informação disponível ao cliente permite distingui-las, porque a única fonte dessa informação seria
justamente a mensagem que não chegou. Essa impossibilidade é uma consequência direta dos modelos
de falha de omissão estudados na Unidade 1, e está presente em qualquer comunicação por rede, com
qualquer protocolo.

A distinção aparece também nas bibliotecas de acesso a serviços. Uma biblioteca HTTP separa dois
tipos de erro: o servidor respondeu com um código de erro, caso em que se sabe o que aconteceu, e a
requisição foi enviada e nenhuma resposta chegou, caso em que não se sabe. Só o segundo caso é o
problema desta seção.

### 4.2 Tempo limite e reenvio

Diante da ausência de resposta, a conduta mais simples é **reenviar** o pedido depois de esgotado o
tempo limite, e repetir isso até obter resposta ou atingir um número máximo de tentativas.

O reenvio resolve bem o primeiro caso da tabela: o pedido perdido é enviado de novo e desta vez
chega. No terceiro caso, porém, o reenvio produz um efeito indesejado. O servidor já havia executado
o pedido, e o pedido reenviado chega como um pedido novo, que é executado **de novo**. O cliente
queria que a operação acontecesse uma vez e ela aconteceu duas.

A escolha do tempo limite também tem consequência. Um tempo curto demais dispara reenvios de pedidos
cuja resposta ainda estava a caminho, e multiplica as duplicatas. Um tempo longo demais deixa o
cliente esperando por uma resposta que não virá. Não existe valor correto em absoluto, porque o
tempo de resposta de uma rede varia, e essa variação é outra das falácias da computação distribuída
estudadas na Unidade 1.

### 4.3 As três semânticas

A combinação dos mecanismos de reenvio e de tratamento de duplicatas define o que o cliente pode
garantir sobre a execução do pedido. Essa garantia chama-se **semântica de entrega**, ou semântica
de invocação. Coulouris apresenta três.

| Semântica | Reenvia o pedido? | Filtra duplicatas? | Garantia sobre a execução |
|---|---|---|---|
| **talvez** | não | não se aplica | executado uma vez ou nenhuma, e o cliente não sabe qual |
| **ao menos uma vez** | sim | não | executado uma ou mais vezes, se houver resposta |
| **no máximo uma vez** | sim | sim, e reenvia a resposta guardada | executado uma vez ou nenhuma, nunca mais de uma |

A semântica **talvez** é a do cliente UDP da Prática 02 com tempo limite e sem reenvio: se a
resposta não chega, o pedido pode ou não ter sido executado.

A semântica **ao menos uma vez** é a do cliente que reenvia. Quando ele recebe resposta, sabe que o
pedido foi executado, mas não sabe quantas vezes. Ela é aceitável somente quando repetir a operação
não causa dano, o que leva ao conceito da seção 4.4.

A semântica **no máximo uma vez** acrescenta, no servidor, a memória dos pedidos já atendidos. Um
pedido repetido não é executado de novo, e o servidor apenas reenvia a resposta que já havia dado.
Ela é a semântica adotada pela chamada remota do Java RMI, e é a que a atividade constrói.

### 4.4 Idempotência

Uma operação é **idempotente** quando executá-la várias vezes produz sobre o estado do servidor o
mesmo efeito que executá-la uma vez.

A definição trata do **efeito sobre o estado**, e não da resposta. Excluir o registro 7 é
idempotente: depois da primeira exclusão o registro não existe, e depois da segunda continua não
existindo. A primeira chamada, porém, responde que excluiu, e a segunda responde que o registro não
foi encontrado. As respostas diferem e a operação continua idempotente, porque o estado final é o
mesmo.

| Operação sobre a conta | Idempotente? | Por quê |
|---|---|---|
| consultar o saldo | sim | não altera o estado |
| definir o saldo como 100 | sim | depois da primeira execução, as seguintes não mudam nada |
| zerar o saldo | sim | o mesmo raciocínio da linha anterior |
| encerrar a conta | sim | uma conta encerrada continua encerrada |
| depositar 10 | não | cada execução acrescenta 10 |
| sacar 10 | não | cada execução retira 10 |

Uma operação que não altera o estado, como a consulta, é chamada de **segura**. Toda operação segura
é idempotente, mas o contrário não vale: definir o saldo altera o estado e é idempotente.

A consequência prática é direta. Se a operação é idempotente, a semântica ao menos uma vez basta, e
o cliente pode reenviar sem medo. Se a operação não é idempotente, reenviar sem filtragem de
duplicatas corrompe o estado, e é preciso ou tornar a operação idempotente ou adotar a semântica no
máximo uma vez.

Muitas vezes é possível reformular uma operação para torná-la idempotente. "Depositar 10" não é
idempotente, mas "registrar o depósito de número 4F2A, no valor de 10" é, desde que o servidor
recuse registrar duas vezes o mesmo número. Essa reformulação é exatamente o que a filtragem de
duplicatas faz.

### 4.5 A filtragem de duplicatas e o seu custo

Para reconhecer um pedido repetido, o servidor precisa de um identificador que seja o mesmo em
todas as tentativas de um mesmo pedido e diferente entre pedidos distintos. Quem cria o
identificador é o cliente, antes da primeira tentativa, e ele o repete em cada reenvio. O servidor
guarda, para cada identificador, a resposta que deu. Quando um identificador já conhecido chega, o
servidor não executa a operação e devolve a resposta guardada.

A resposta precisa ser guardada, e não apenas o identificador, porque o cliente que reenviou ainda
não recebeu resposta nenhuma. Se o servidor apenas ignorasse o pedido repetido, o cliente
continuaria sem resposta e esgotaria as tentativas.

O custo está na memória do servidor. A tabela de respostas cresce a cada pedido, e em algum momento
precisa ser podada. Podar uma resposta cedo demais reabre a possibilidade de execução dupla, caso o
reenvio correspondente chegue depois. Os sistemas reais resolvem isso com um prazo de validade para
cada identificador, ou com a confirmação do cliente de que recebeu a resposta, o que permite ao
servidor descartá-la.

### 4.6 E a semântica exatamente uma vez

A semântica que o usuário deseja é **exatamente uma vez**: o pedido executado uma única vez, sempre.
Ela não pode ser garantida apenas pelo protocolo de comunicação quando o servidor pode falhar. Se o
servidor cai logo depois de executar e antes de registrar a resposta, ao voltar ele não sabe se
executou, e qualquer decisão que tome pode estar errada.

O que os sistemas reais oferecem, e às vezes chamam de exatamente uma vez, é a combinação de ao
menos uma vez com idempotência: o cliente reenvia até obter resposta, e o servidor garante que as
repetições não alteram o estado. O efeito observado é o de uma única execução, embora a mensagem
possa ter sido entregue várias vezes. Essa mesma combinação volta nos itens de REST e de mensageria
desta unidade, e na Unidade 6, nos padrões de resiliência.

---

## 5. Semânticas de entrega: atividade

### 5.1 Criar os arquivos

Na máquina **`banco`**, criar o arquivo `servidorConta.py` com o conteúdo da seção 14.6. Na máquina
**`aplicacao`**, criar o arquivo `clienteConta.py` com o conteúdo da seção 14.7.

O servidor mantém o saldo de uma conta, que começa em zero, e atende dois tipos de pedido,
depositar e zerar, por UDP. Cada pedido traz um identificador. No início do arquivo há duas
constantes:

| Constante | Valor inicial | O que controla |
|---|---|---|
| `FILTRAR_DUPLICATAS` | `False` | se o servidor reconhece pedidos repetidos pelo identificador |
| `PERDA_DE_RESPOSTAS` | `0.0` | fração das respostas que o próprio servidor descarta, usada só no plano alternativo da seção 5.7 |

O cliente zera a conta e em seguida pede 20 depósitos de 10. Cada pedido recebe um identificador
novo, criado uma única vez e repetido em cada reenvio. O tempo limite é de meio segundo, com até
cinco tentativas por pedido. No fim, o cliente apresenta o saldo esperado, o saldo informado pelo
servidor, o número de reenvios e o número de pedidos que ficaram sem resposta.

### 5.2 Sem perda

Na máquina `banco`:

```bash
python3 servidorConta.py
```

Na máquina `aplicacao`:

```bash
python3 clienteConta.py
```

O saldo informado é 200, igual ao esperado, com nenhum reenvio. Na rede das máquinas virtuais,
sem perda, a semântica é irrelevante, porque nenhuma resposta se perde. As diferenças só aparecem
quando a falha aparece.

Manter o servidor em execução.

### 5.3 Perda das respostas

A perda é injetada com o comando `tc`, do sistema operacional, que controla a fila de saída de uma
interface de rede. A opção `netem` emula condições de rede, e `loss 30%` descarta ao acaso 30% dos
pacotes que **saem** pela interface.

Abrir um segundo terminal para a máquina `banco`, na máquina hospedeira:

```bash
ssh SEU_USUARIO@192.168.56.101
```

Nesse segundo terminal, aplicar a perda à interface da rede exclusiva de hospedeiro:

```bash
sudo tc qdisc add dev enp0s8 root netem loss 30%
```

Como a regra afeta apenas o que sai da máquina `banco`, os pedidos chegam todos, e o que se perde
são as respostas. É o terceiro caso da tabela da seção 4.1, o pedido executado com a resposta
perdida.

A sessão de acesso remoto usa a mesma interface e pode ficar mais lenta enquanto a perda estiver
ativa. O protocolo TCP da sessão reenvia o que se perde, e por isso ela continua funcionando.

Na máquina `aplicacao`, executar o cliente de novo:

```bash
python3 clienteConta.py
```

Um resultado típico:

```
  pedido 3f9c2a1b sem resposta na tentativa 1
  pedido 81d0e44c sem resposta na tentativa 1
  pedido 81d0e44c sem resposta na tentativa 2
  ...

Depositos pedidos      : 20 de 10
Saldo esperado         : 200
Saldo informado        : 330
Reenvios realizados    : 13
Pedidos sem resposta   : 0
```

Os números variam a cada execução, porque a perda é aleatória, mas o saldo informado é maior do que
o esperado, e a diferença é igual a 10 vezes o número de reenvios. No terminal do servidor, o mesmo
identificador aparece mais de uma vez com a mensagem de depósito, e o saldo cresce a cada
aparição. Cada reenvio foi executado como um depósito novo. É a semântica **ao menos uma vez**
aplicada a uma operação que não é idempotente.

Observar também o pedido de zerar, que o cliente envia no início. Se ele for repetido, o terminal do
servidor mostra o saldo zerado mais de uma vez, e isso não causa dano algum, porque zerar é
idempotente.

### 5.4 Com a filtragem de duplicatas

Interromper o servidor com `Ctrl+C`. No arquivo `servidorConta.py`, trocar a linha

```python
FILTRAR_DUPLICATAS = False
```

por

```python
FILTRAR_DUPLICATAS = True
```

Iniciar o servidor de novo e, com a perda ainda ativa, executar o cliente:

```bash
python3 servidorConta.py
```

```bash
python3 clienteConta.py
```

O saldo informado passa a ser 200, mesmo com reenvios. No terminal do servidor, cada identificador
repetido aparece com a mensagem de pedido repetido e resposta reenviada, e o saldo não muda nessas
linhas. É a semântica **no máximo uma vez**, construída pela tabela `respostas_enviadas`, que a
seção 4.5 descreveu.

Localizar no código as duas linhas que produzem essa garantia. A primeira é a condição que consulta
a tabela antes de executar. A segunda é a que grava a resposta na tabela depois de executar.

### 5.5 Perda dos pedidos

No segundo terminal da máquina `banco`, remover a perda:

```bash
sudo tc qdisc del dev enp0s8 root
```

Abrir um segundo terminal para a máquina `aplicacao` e aplicar a perda lá, de modo que agora se
percam os pedidos, e não as respostas:

```bash
sudo tc qdisc add dev enp0s8 root netem loss 30%
```

Voltar o servidor para `FILTRAR_DUPLICATAS = False`, reiniciá-lo e executar o cliente.

O saldo informado volta a ser 200, mesmo sem filtragem e com reenvios. Os pedidos perdidos nunca
chegaram ao servidor, e o reenvio apenas entregou o que faltava. É o primeiro caso da tabela da
seção 4.1, o único em que o reenvio não produz duplicata.

Do lado do cliente, as duas situações das seções 5.3 e 5.5 foram indistinguíveis: nos dois casos ele
viu tempos limite e fez reenvios. Só o servidor sabia o que tinha acontecido. Essa é a razão pela
qual o cliente não pode decidir sozinho se o reenvio é seguro, e pela qual a decisão depende da
idempotência da operação e da existência do filtro no servidor.

### 5.6 Remover a perda

Ao final, remover a regra nas duas máquinas em que ela foi aplicada:

```bash
sudo tc qdisc del dev enp0s8 root
```

Conferir que não há regra ativa:

```bash
tc qdisc show dev enp0s8
```

A saída não deve conter a palavra `netem`.

### 5.7 Plano alternativo, sem o comando tc

Se o comando `tc` responder com erro, a perda pode ser simulada pelo próprio servidor. No arquivo
`servidorConta.py`, trocar a linha

```python
PERDA_DE_RESPOSTAS = 0.0
```

por

```python
PERDA_DE_RESPOSTAS = 0.3
```

O servidor passa a descartar 30% das respostas depois de executar o pedido, que é o mesmo efeito da
seção 5.3. As seções 5.3 e 5.4 podem ser repetidas dessa forma, sem nenhum comando `tc`. A seção
5.5 não tem equivalente nesse plano, porque o servidor não tem como descartar um pedido que não
chegou até ele.

---

## 6. REST: fundamentação

### 6.1 Do soquete à interface REST

A Prática 02 mostrou a mesma operação em três degraus. No soquete, o programa decide tudo, do
formato da mensagem ao modo de informar o erro. Na chamada remota, o mecanismo esconde a rede atrás
de uma chamada de função. No HTTP, um padrão público define o método, o formato, o código de
resultado e o enquadramento. O REST é o modo mais difundido de organizar um serviço sobre esse
terceiro degrau.

**REST** significa *Representational State Transfer*, transferência de estado representacional. O
termo foi definido por Roy Fielding em 2000, na tese em que ele descreve os princípios que
orientaram o próprio desenho do HTTP. REST não é protocolo, nem biblioteca, nem formato de dados. É
um **estilo arquitetural**, ou seja, um conjunto de restrições que, respeitadas, dão ao sistema
certas propriedades, como escalabilidade, simplicidade e independência entre cliente e servidor. O
HTTP é o protocolo com que o estilo costuma ser realizado, mas as restrições valem por si.

Uma requisição HTTP é texto enviado por uma conexão TCP, exatamente como a mensagem do
`clienteTCP.py` da Prática 02. A diferença é que o formato desse texto é padronizado:

```
POST /contas/7/depositos HTTP/1.1
Host: 192.168.56.101:8080
Content-Type: application/json
Content-Length: 13

{"valor": 10}
```

| Parte | Papel | No exemplo |
|---|---|---|
| método | a intenção do pedido | `POST` |
| caminho | o recurso sobre o qual se age | `/contas/7/depositos` |
| cabeçalhos | informações sobre a mensagem | tipo e tamanho do corpo |
| corpo | a representação enviada | `{"valor": 10}` |

O cabeçalho `Content-Length` é o enquadramento do HTTP. É o mesmo prefixo de tamanho construído na
seção 3.3, escrito em texto em vez de 4 bytes binários. A resposta segue a mesma forma, com uma
linha de status no lugar do método:

```
HTTP/1.0 201 Created
Content-Type: application/json
Content-Length: 51

{"numero": 7, "titular": "Ana Souza", "saldo": 110}
```

### 6.2 Recurso, representação e estado

Um **recurso** é qualquer coisa que o serviço decide expor e nomear: uma conta, a lista de contas,
os depósitos de uma conta. Cada recurso é identificado por uma URL, como `/contas/7`. O cliente
nunca recebe o recurso em si, que vive no servidor. Ele recebe uma **representação** do estado do
recurso naquele momento, aqui em JSON, e para alterar o estado envia uma nova representação. É isso
que o nome descreve: o estado dos recursos é transferido entre as partes por meio de
representações.

A URL identifica **o quê**, e o método diz **o que fazer com ele**. Por isso a URL leva
substantivos e não verbos: `/contas/7`, e não `/buscarConta?id=7`.

| Forma | Exemplo | Uso |
|---|---|---|
| coleção | `/contas` | o conjunto de contas |
| item da coleção | `/contas/7` | a conta 7 |
| subcoleção | `/contas/7/depositos` | os depósitos da conta 7 |
| parâmetro de consulta | `/contas?titular=Ana` | filtrar ou paginar uma coleção |

### 6.3 As restrições do estilo

| Restrição | O que exige | O que se ganha |
|---|---|---|
| cliente e servidor | separar quem apresenta de quem guarda os dados | cada lado evolui sem o outro |
| sem estado de sessão | cada requisição traz tudo o que é preciso para ser atendida | qualquer réplica do servidor pode atender qualquer requisição |
| cache | as respostas declaram se podem ser reaproveitadas | menos requisições e menor latência |
| sistema em camadas | o cliente não sabe se fala com o servidor ou com um intermediário | balanceadores e proxies entram sem mudar o cliente |
| interface uniforme | todos os recursos manipulados pelo mesmo conjunto de operações | o cliente que sabe usar um recurso sabe usar todos |
| código sob demanda, opcional | o servidor pode enviar código ao cliente | extensão do cliente sem reinstalação |

A restrição **sem estado** costuma ser mal entendida. O servidor tem estado, e a API da atividade
guarda as contas num dicionário. O que ele não guarda é o estado da **conversa** com cada cliente,
como "este cliente está na página 3" ou "este cliente já se identificou". Essa restrição é o que
permite, na Unidade 5, colocar várias réplicas do mesmo serviço lado a lado.

A **interface uniforme** tem quatro partes na formulação de Fielding: identificação dos recursos
pela URL, manipulação por meio de representações, mensagens autodescritivas, que trazem no método e
nos cabeçalhos o que é preciso para interpretá-las, e o uso de ligações nas representações para
indicar ao cliente as ações possíveis a seguir.

### 6.4 Métodos, segurança e idempotência

Cada método tem uma semântica definida pelo padrão HTTP, e essa semântica inclui as duas
propriedades estudadas na seção 4.4.

| Método | Uso | Seguro | Idempotente |
|---|---|---|---|
| `GET` | consultar a representação | sim | sim |
| `PUT` | substituir o recurso pela representação enviada, criando se não existir | não | sim |
| `DELETE` | remover o recurso | não | sim |
| `POST` | criar algo novo subordinado ao recurso, ou processar uma ação | não | não |
| `PATCH` | alterar parte do recurso | não | não necessariamente |

A tabela é o que torna o reenvio seguro ou não no HTTP. Um cliente, um navegador ou um
intermediário pode repetir um `GET`, um `PUT` ou um `DELETE` depois de um tempo limite sem risco de
efeito duplicado. Um `POST` repetido pode criar dois pedidos ou fazer dois depósitos. É o problema
da seção 5.3, agora no HTTP.

O `DELETE` repetido mostra de novo que idempotência trata do estado e não da resposta. O primeiro
responde `204 No Content` e o segundo responde `404 Not Found`, e a conta está removida nos dois
casos.

Para tornar seguro o reenvio de um `POST`, os serviços reais usam um **identificador de
idempotência**, enviado pelo cliente num cabeçalho como `Idempotency-Key`. O servidor guarda a
resposta dada a cada identificador e, diante de um identificador repetido, devolve a resposta
guardada sem executar de novo. É a filtragem de duplicatas da seção 4.5, com o identificador
viajando num cabeçalho HTTP.

### 6.5 Códigos de resposta

| Família | Significado | Exemplos da atividade |
|---|---|---|
| 2xx | sucesso | `200 OK`, `201 Created`, `204 No Content` |
| 3xx | redirecionamento | não usados |
| 4xx | erro de quem pediu | `400 Bad Request` para corpo inválido, `404 Not Found`, `405 Method Not Allowed` |
| 5xx | erro do servidor | `500 Internal Server Error`, `503 Service Unavailable` |

O código separa o resultado do conteúdo, o que a chamada remota da Prática 02 não fazia, já que ali o
erro da divisão por zero voltou como se fosse um resultado. E o código só existe quando há
resposta. A ausência de resposta, estudada na seção 4.1, continua sendo o caso em que o cliente não
sabe o que aconteceu, e nenhum código HTTP a representa.

---

## 7. REST: atividade

Na máquina **`banco`**, criar o arquivo `apiContas.py` com o conteúdo da seção 14.8 e iniciar:

```bash
python3 apiContas.py
```

A API usa apenas o módulo `http.server` da biblioteca padrão. Ela começa com a conta 7 e atende
`GET`, `PUT` e `DELETE` em `/contas/N`, `GET` em `/contas` e `POST` em `/contas/N/depositos`.

### 7.1 Consultas e códigos

Na máquina **`aplicacao`**:

```bash
curl -i http://192.168.56.101:8080/contas
curl -i http://192.168.56.101:8080/contas/7
curl -i http://192.168.56.101:8080/contas/99
```

A opção `-i` apresenta a linha de status e os cabeçalhos antes do corpo. As duas primeiras
respondem `200 OK` com a representação em JSON. A terceira responde `404 Not Found`, e o corpo
explica o erro. O terminal da API registra cada requisição com o método, o caminho e o código.

### 7.2 PUT e POST repetidos

```bash
curl -i -X PUT -d '{"titular": "Bruno Lima", "saldo": 50}' http://192.168.56.101:8080/contas/8
curl -i -X PUT -d '{"titular": "Bruno Lima", "saldo": 50}' http://192.168.56.101:8080/contas/8
curl -i -X POST -d '{"valor": 10}' http://192.168.56.101:8080/contas/7/depositos
curl -i -X POST -d '{"valor": 10}' http://192.168.56.101:8080/contas/7/depositos
```

O primeiro `PUT` responde `201 Created` e o segundo `200 OK`, e a conta 8 fica igual depois dos dois.
Os dois `POST` respondem `201 Created`, e o saldo da conta 7 passa de 100 para 110 e de 110 para 120.

### 7.3 Chave de idempotência e DELETE repetido

```bash
curl -i -X POST -H 'Idempotency-Key: dep-001' -d '{"valor": 10}' http://192.168.56.101:8080/contas/7/depositos
curl -i -X POST -H 'Idempotency-Key: dep-001' -d '{"valor": 10}' http://192.168.56.101:8080/contas/7/depositos
curl -i -X DELETE http://192.168.56.101:8080/contas/8
curl -i -X DELETE http://192.168.56.101:8080/contas/8
```

O primeiro depósito com a chave responde `201` e leva o saldo a 130. O segundo responde `200` com o
mesmo saldo de 130, e o terminal da API informa que a chave foi repetida e o depósito não foi
executado de novo. As remoções respondem `204` e depois `404`.

### 7.4 A API na rede do laboratório

A API pode ser publicada para a rede do laboratório pelo mesmo mecanismo usado com a aplicação na
Prática 01. No VirtualBox, nas configurações de rede da máquina `banco`, no adaptador em NAT,
acrescentar uma regra de redirecionamento de portas:

| Nome | Protocolo | IP do Hospedeiro | Porta do Hospedeiro | IP do Convidado | Porta do Convidado |
|---|---|---|---|---|---|
| `api` | TCP | endereço da estação na rede do laboratório | 8080 | vazio | 8080 |

Qualquer computador do laboratório passa a alcançar a API pelo endereço da estação seguido de
`:8080`. Abrir no navegador a lista de contas da API de um colega. O navegador faz um `GET`, e o que
ele apresenta é a mesma representação em JSON que o `curl` recebeu.

Se o comando `curl` não existir na máquina `aplicacao`, instalar com `sudo apt install -y curl`.

---

## 8. Comunicação assíncrona e mensageria: fundamentação

### 8.1 Acoplamento no tempo

Em tudo o que foi visto até aqui, o soquete, a chamada remota e o REST, quem pede espera a resposta.
Os dois processos precisam estar em execução no mesmo momento, e se o servidor está fora do ar o
pedido falha. Essa forma de comunicação é **síncrona**, e cria dois acoplamentos entre as partes.
No **tempo**, porque as duas precisam existir ao mesmo tempo. E na **referência**, porque quem pede
precisa saber o endereço de quem atende.

A comunicação **assíncrona** por mensagens desfaz os dois acoplamentos. O produtor entrega a
mensagem a um intermediário, a **fila**, e segue adiante sem esperar o processamento. O consumidor
retira a mensagem quando puder, que pode ser logo depois ou horas mais tarde. O produtor não sabe
quem vai consumir, e o consumidor não sabe quem produziu. Os dois conhecem apenas a fila. Van Steen
e Tanenbaum chamam esse arranjo de comunicação persistente e desacoplada, em contraste com a
comunicação transitória da chamada remota.

### 8.2 Os elementos

| Elemento | Papel |
|---|---|
| produtor | publica mensagens na fila |
| intermediário, ou *broker* | recebe, guarda e entrega as mensagens |
| fila | a sequência de mensagens à espera de consumo |
| consumidor | retira e processa as mensagens |
| confirmação | aviso do consumidor de que terminou de processar uma mensagem |

Há dois modelos de distribuição. No modelo **ponto a ponto**, cada mensagem é entregue a um único
consumidor, e vários consumidores ligados à mesma fila dividem o trabalho entre si. São os
**consumidores concorrentes**, e acrescentar consumidores aumenta a capacidade. No modelo de
**publicação e assinatura**, cada mensagem publicada num tópico é entregue a todos os assinantes do
tópico. O primeiro distribui trabalho, e o segundo distribui eventos. A atividade usa o primeiro.

### 8.3 Confirmação e reentrega

O intermediário precisa decidir quando descartar uma mensagem. Se descartá-la no momento da
entrega, uma falha do consumidor no meio do processamento faz a mensagem se perder, o que é a
semântica no máximo uma vez. Se descartá-la apenas depois da **confirmação** do consumidor, uma
falha antes da confirmação faz a mensagem voltar para a fila e ser entregue de novo, o que é a
semântica **ao menos uma vez**.

Os intermediários de uso profissional adotam a segunda opção como padrão, porque perder uma mensagem
costuma ser pior do que processá-la duas vezes. O preço é o mesmo da seção 4.3: o consumidor pode
receber a mesma mensagem mais de uma vez, por exemplo quando processou, gravou o resultado e caiu
antes de confirmar. Por isso o consumidor precisa ser **idempotente**, em geral guardando os
identificadores das mensagens já processadas e ignorando as repetidas. É a filtragem de duplicatas
da seção 4.5, agora do lado de quem consome.

### 8.4 Ferramentas

O intermediário da atividade é um programa de poucas dezenas de linhas, escrito para mostrar o
mecanismo. Na prática profissional, esse papel é de ferramentas como o **RabbitMQ**, que implementa
o protocolo AMQP e trabalha com filas e confirmações como as da atividade, e o **Apache Kafka**, que
guarda as mensagens num registro persistente que vários consumidores podem ler e reler. O **MQTT**,
visto no semestre anterior, é um protocolo de publicação e assinatura voltado a dispositivos com
pouca capacidade, comum em internet das coisas.

---

## 9. Comunicação assíncrona e mensageria: atividade

Na máquina **`banco`**, criar o arquivo `fila.py` com o conteúdo da seção 14.9. Na máquina
**`aplicacao`**, criar os arquivos `produtor.py` e `consumidor.py`, das seções 14.10 e 14.11. O
`consumidor.py` também é criado na máquina `banco`, para a seção 9.2.

As mensagens trafegam em JSON, uma por linha. A quebra de linha é o enquadramento, pela forma de
delimitador descrita na seção 1.5.

### 9.1 O produtor sem consumidor

Na máquina `banco`:

```bash
python3 fila.py
```

Na máquina `aplicacao`, sem nenhum consumidor em execução:

```bash
python3 produtor.py
```

O produtor publica dez mensagens e termina. O terminal da fila registra as dez, e elas ficam
guardadas. Numa chamada remota ou numa API REST, o mesmo pedido teria falhado sem um servidor para
atender. Aqui, o produtor nem sabe se existe consumidor.

### 9.2 Dois consumidores, e um deles cai

Abrir um segundo terminal para a máquina `banco` e executar um consumidor ali. Na máquina
`aplicacao`, executar outro consumidor, quase ao mesmo tempo:

```bash
python3 consumidor.py
```

As mensagens se dividem entre os dois, e cada consumidor leva dois segundos por mensagem. Enquanto
processam, interromper um deles com `Ctrl+C` logo depois de aparecer uma linha `Processando`. O
terminal da fila apresenta:

```
Consumidor 192.168.56.102:48210 caiu sem confirmar. Mensagem 7 volta para a fila
Entregue mensagem 7 ao consumidor 192.168.56.101:39512
Confirmada mensagem 7 pelo consumidor 192.168.56.101:39512
```

A mensagem 7 foi entregue duas vezes. Se o consumidor interrompido já tivesse gravado um pagamento
antes de cair, o pagamento seria gravado de novo pelo outro. A fila garantiu que nenhuma mensagem se
perdesse, e deixou para o consumidor a responsabilidade de não repetir o efeito.

---

## 10. Síntese

| Pergunta | Serialização | Semânticas de entrega | REST | Mensageria |
|---|---|---|---|---|
| Qual é o problema | o dado na memória não atravessa a rede, e o fluxo TCP não separa mensagens | o cliente não sabe o que aconteceu quando a resposta não chega | organizar um serviço de modo que qualquer cliente o use da mesma forma | produtor e consumidor não podem depender de existir ao mesmo tempo |
| O que resolve | representação externa de dados e enquadramento | reenvio, idempotência e filtragem de duplicatas | recursos, representações e métodos com semântica padronizada | uma fila que guarda as mensagens até a confirmação |
| Onde a idempotência aparece | não se aplica | na decisão de reenviar | na classificação dos métodos e na chave de idempotência | no consumidor que recebe a mesma mensagem duas vezes |
| O que acontece se o acordo falhar | dados errados em silêncio | operações executadas mais de uma vez | um `POST` repetido cria dois recursos | um efeito repetido pelo reprocessamento |

As quatro partes têm a mesma estrutura. Em todas, a comunicação funciona porque as partes seguem
uma regra combinada que não aparece em nenhuma mensagem isolada. Na serialização, a regra diz como
ler os bytes. Na semântica de entrega, diz o que fazer com um pedido já visto. No REST, a regra está
publicada no próprio padrão HTTP, na semântica de cada método. Na mensageria, está no acordo entre o
intermediário e o consumidor sobre quando uma mensagem pode ser descartada.

O problema da seção 4.1 atravessa as quatro partes sem ser eliminado. Nenhuma forma de comunicação
permite ao cliente saber o que aconteceu quando a resposta não chega. O que cada uma oferece é um
modo de tornar a repetição inofensiva, e esse modo é sempre a idempotência, construída pela
natureza da operação ou por um identificador que o outro lado reconhece.

---

## 11. Questões para estudo

1. Por que um endereço de memória não pode ser enviado de um processo para outro no lugar do valor
   que ele aponta?
2. O mesmo registro ocupou 55 bytes em JSON e 32 em binário. Em que situação essa diferença pesa na
   escolha do formato, e em que situação a legibilidade do JSON pesa mais?
3. Na seção 3.1, a leitura com a ordem de bytes invertida não produziu erro. Explicar por que isso
   torna o problema mais grave do que se houvesse erro.
4. Por que o texto `Ana Souza` saiu correto mesmo com a ordem de bytes invertida?
5. Um colega propõe enquadrar as mensagens JSON com uma quebra de linha no fim de cada uma. Em que
   caso essa escolha falharia, e por que o prefixo de tamanho não tem esse problema?
6. Por que a função `receber_exato` repete a chamada de recebimento, em vez de chamá-la uma única
   vez?
7. Descrever as três situações que levam o cliente a não receber resposta, e explicar por que ele
   não consegue distingui-las.
8. Classificar como idempotente ou não, justificando: alterar o endereço do cliente para um valor
   informado, acrescentar um item ao carrinho de compras, cancelar um pedido, incrementar um contador
   de acessos.
9. Na seção 5.3, a diferença entre o saldo informado e o esperado foi igual a 10 vezes o número de
   reenvios. Explicar essa relação.
10. Por que o servidor guarda a resposta de cada pedido, e não apenas o identificador?
11. Por que o identificador é criado pelo cliente, e não pelo servidor?
12. Nas seções 5.3 e 5.5 houve reenvios nas duas, e só em uma o saldo ficou errado. O que o cliente
    viu de diferente em cada caso?
13. Explicar por que a semântica exatamente uma vez não pode ser garantida só pelo protocolo quando o
    servidor pode falhar, e o que os sistemas reais oferecem em seu lugar.
14. Por que REST é chamado de estilo arquitetural, e não de protocolo? Qual é a relação entre REST e
    HTTP?
15. Explicar a diferença entre o recurso `/contas/7` e a representação recebida pelo cliente.
16. A API da atividade guarda as contas num dicionário. Por que ela ainda assim respeita a restrição
    sem estado?
17. Na seção 7.3, o segundo `DELETE` respondeu 404. Explicar por que o `DELETE` continua sendo
    idempotente.
18. Um aplicativo reenvia automaticamente toda requisição que não recebe resposta em dez segundos. Para
    quais métodos isso é seguro, e o que o serviço precisa oferecer para que seja seguro também no
    `POST`?
19. Qual é a diferença entre receber `500 Internal Server Error` e não receber resposta nenhuma, do
    ponto de vista do que o cliente sabe sobre o pedido?
20. Na seção 9.1, o produtor terminou sem que houvesse consumidor. O que teria acontecido com a mesma
    operação feita por uma chamada remota? Que acoplamento a fila eliminou?
21. Explicar a diferença entre consumidores concorrentes e publicação e assinatura, e dar um exemplo
    de uso de cada um.
22. Por que a fila da atividade só descarta a mensagem depois da confirmação? Qual semântica de
    entrega isso produz, e qual seria produzida se ela descartasse no momento da entrega?
23. Um consumidor grava pagamentos a partir das mensagens de uma fila. Descrever uma forma de torná-lo
    idempotente.

---

## 12. Referência de comandos

**Executar cada programa**

```bash
python3 formatos.py              # maquina aplicacao
python3 servidorTexto.py         # maquina banco
python3 clienteTexto.py          # maquina aplicacao
python3 servidorRegistro.py      # maquina banco
python3 clienteRegistro.py       # maquina aplicacao
python3 servidorConta.py         # maquina banco
python3 clienteConta.py          # maquina aplicacao
python3 apiContas.py             # maquina banco
python3 fila.py                  # maquina banco
python3 produtor.py              # maquina aplicacao
python3 consumidor.py            # maquinas aplicacao e banco
```

**Requisições HTTP com o curl, na máquina aplicacao**

```bash
curl -i http://192.168.56.101:8080/contas
curl -i -X PUT -d '{"titular": "Bruno Lima", "saldo": 50}' http://192.168.56.101:8080/contas/8
curl -i -X POST -H 'Idempotency-Key: dep-001' -d '{"valor": 10}' http://192.168.56.101:8080/contas/7/depositos
curl -i -X DELETE http://192.168.56.101:8080/contas/8
```

| Opção | Significado |
|---|---|
| `-i` | apresenta a linha de status e os cabeçalhos da resposta |
| `-X` | define o método, que sem a opção é `GET` |
| `-d` | define o corpo da requisição |
| `-H` | acrescenta um cabeçalho |

**Injetar, conferir e remover perda de pacotes**

```bash
sudo tc qdisc add dev enp0s8 root netem loss 30%
tc qdisc show dev enp0s8
sudo tc qdisc del dev enp0s8 root
```

| Parte do comando | Significado |
|---|---|
| `qdisc` | a disciplina de fila, que decide o que acontece com os pacotes de saída |
| `add` e `del` | acrescentar ou remover a regra |
| `dev enp0s8` | a interface da rede exclusiva de hospedeiro |
| `root` | a regra se aplica a toda a saída da interface |
| `netem loss 30%` | emulação de rede, com descarte aleatório de 30% dos pacotes |

**Verificar se um serviço está escutando, na máquina do serviço**

```bash
ss -ltnp | grep 9100         # servico TCP de registros
ss -lunp | grep 9200         # servico UDP da conta
```

---

## 13. Diagnóstico de falhas

| Sintoma | Causa provável | Verificação |
|---|---|---|
| `Error: Specified qdisc kind is unknown` ao usar o `tc` | módulo de emulação de rede ausente no sistema | usar o plano alternativo da seção 5.7 |
| `RTNETLINK answers: File exists` ao aplicar a perda | já existe uma regra na interface | remover com `sudo tc qdisc del dev enp0s8 root` e aplicar de novo |
| `ConnectionRefusedError` no cliente de registros | servidor não iniciado ou já interrompido | iniciar o servidor antes do cliente |
| `OSError: [Errno 98] Address already in use` | outra instância do servidor ainda em execução | interromper a outra instância, conferindo com `ss -ltnp` |
| Todos os pedidos da conta ficam sem resposta | servidor não iniciado, ou endereço errado no cliente | conferir `ss -lunp` na máquina `banco` e a linha `SERVIDOR` no cliente |
| Saldo errado mesmo com `FILTRAR_DUPLICATAS = True` | servidor não reiniciado depois da alteração | interromper e iniciar o servidor de novo |
| A sessão de acesso remoto fica lenta | perda aplicada à interface que a sessão usa | comportamento esperado, que termina ao remover a perda |
| `curl: command not found` | programa não instalado na máquina | `sudo apt install -y curl` |
| `curl: (7) Failed to connect` na porta 8080 | API não iniciada | iniciar o `apiContas.py` na máquina `banco` |
| O navegador do colega não abre a API | regra de redirecionamento ausente ou com o endereço errado | conferir a regra `api` no adaptador em NAT da máquina `banco` |
| O consumidor não recebe nada | fila vazia, ou produtor executado antes de a fila iniciar | executar o produtor de novo com a fila em execução |
| A mensagem interrompida não foi reentregue | havia só um consumidor | manter o segundo consumidor em execução, ou iniciar outro |
| Erro de indentação ao executar | espaços perdidos na colagem | conferir com `cat -A` |

---

## 14. Apêndice com o conteúdo integral dos arquivos

### 14.1 `formatos.py`, na máquina `aplicacao`

```python
import json
import struct

conta = {"numero": 7, "titular": "Ana Souza", "saldo": 1520.75}

# Formato textual: o JSON descreve os proprios campos.
em_json = json.dumps(conta).encode("utf-8")

# Formato binario: um inteiro sem sinal de 4 bytes, um texto de 20 bytes
# e um numero real de 8 bytes, em ordem de rede (o sinal "!").
FORMATO = "!I20sd"
em_binario = struct.pack(FORMATO, conta["numero"],
                         conta["titular"].encode("utf-8"), conta["saldo"])

print("JSON    :", len(em_json), "bytes")
print(em_json)
print()
print("Binario :", len(em_binario), "bytes")
print(em_binario.hex(" "))
print()

numero, titular, saldo = struct.unpack(FORMATO, em_binario)
print("Lido com o formato combinado :", numero, titular.rstrip(b"\x00").decode(), saldo)

numero, titular, saldo = struct.unpack("<I20sd", em_binario)
print("Lido com outra ordem de bytes:", numero, titular.rstrip(b"\x00").decode(), saldo)
```

### 14.2 `servidorTexto.py`, na máquina `banco`

```python
import socket

servidor = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
servidor.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
servidor.bind(("0.0.0.0", 9100))
servidor.listen()
print("Servidor aguardando na porta 9100...")

while True:
    conexao, origem = servidor.accept()
    print("Conexao de", origem)
    while True:
        dados = conexao.recv(4096)
        if not dados:
            break
        print("  recv devolveu", len(dados), "bytes:", dados)
    conexao.close()
```

### 14.3 `clienteTexto.py`, na máquina `aplicacao`

```python
import json
import socket

SERVIDOR = ("192.168.56.101", 9100)

registros = [
    {"numero": 7, "titular": "Ana Souza", "saldo": 1520.75},
    {"numero": 8, "titular": "Bruno Lima", "saldo": 80.0},
    {"numero": 9, "titular": "Carla Dias", "saldo": 0.5},
]

cliente = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
cliente.connect(SERVIDOR)
for registro in registros:
    cliente.sendall(json.dumps(registro).encode("utf-8"))
cliente.close()
print("Tres registros enviados.")
```

### 14.4 `servidorRegistro.py`, na máquina `banco`

```python
import json
import socket
import struct


def receber_exato(conexao, quantidade):
    dados = b""
    while len(dados) < quantidade:
        parte = conexao.recv(quantidade - len(dados))
        if not parte:
            return None
        dados += parte
    return dados


def receber_mensagem(conexao):
    cabecalho = receber_exato(conexao, 4)
    if cabecalho is None:
        return None
    tamanho = struct.unpack("!I", cabecalho)[0]
    return receber_exato(conexao, tamanho)


servidor = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
servidor.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
servidor.bind(("0.0.0.0", 9100))
servidor.listen()
print("Servidor de registros aguardando na porta 9100...")

while True:
    conexao, origem = servidor.accept()
    print("Conexao de", origem)
    while True:
        mensagem = receber_mensagem(conexao)
        if mensagem is None:
            break
        registro = json.loads(mensagem.decode("utf-8"))
        print("  recebido:", registro)
    conexao.close()
```

### 14.5 `clienteRegistro.py`, na máquina `aplicacao`

```python
import json
import socket
import struct

SERVIDOR = ("192.168.56.101", 9100)

registros = [
    {"numero": 7, "titular": "Ana Souza", "saldo": 1520.75},
    {"numero": 8, "titular": "Bruno Lima", "saldo": 80.0},
    {"numero": 9, "titular": "Carla Dias", "saldo": 0.5},
]


def enviar_mensagem(conexao, dados):
    conexao.sendall(struct.pack("!I", len(dados)) + dados)


cliente = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
cliente.connect(SERVIDOR)
for registro in registros:
    enviar_mensagem(cliente, json.dumps(registro).encode("utf-8"))
cliente.close()
print("Tres registros enviados.")
```

### 14.6 `servidorConta.py`, na máquina `banco`

```python
import json
import random
import socket

FILTRAR_DUPLICATAS = False
PERDA_DE_RESPOSTAS = 0.0

saldo = 0
respostas_enviadas = {}

servidor = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
servidor.bind(("0.0.0.0", 9200))
print("Servidor da conta aguardando na porta 9200...")
print("Filtro de duplicatas:", "ligado" if FILTRAR_DUPLICATAS else "desligado")

while True:
    dados, origem = servidor.recvfrom(1024)
    pedido = json.loads(dados.decode("utf-8"))

    if FILTRAR_DUPLICATAS and pedido["id"] in respostas_enviadas:
        print("Pedido", pedido["id"], "repetido, reenviando a resposta guardada")
        resposta = respostas_enviadas[pedido["id"]]
    else:
        if pedido["operacao"] == "depositar":
            saldo = saldo + pedido["valor"]
            print("Pedido", pedido["id"], "deposito de", pedido["valor"], "saldo agora", saldo)
        elif pedido["operacao"] == "zerar":
            saldo = 0
            respostas_enviadas.clear()
            print("Pedido", pedido["id"], "saldo zerado")
        resposta = json.dumps({"id": pedido["id"], "saldo": saldo}).encode("utf-8")
        respostas_enviadas[pedido["id"]] = resposta

    if random.random() < PERDA_DE_RESPOSTAS:
        print("  resposta descartada de proposito")
        continue
    servidor.sendto(resposta, origem)
```

### 14.7 `clienteConta.py`, na máquina `aplicacao`

```python
import json
import socket
import uuid

SERVIDOR = ("192.168.56.101", 9200)
TEMPO_LIMITE = 0.5
MAXIMO_DE_TENTATIVAS = 5
DEPOSITOS = 20
VALOR = 10

cliente = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
cliente.settimeout(TEMPO_LIMITE)


def enviar(operacao, valor=0):
    pedido = {"id": str(uuid.uuid4())[:8], "operacao": operacao, "valor": valor}
    dados = json.dumps(pedido).encode("utf-8")
    for tentativa in range(1, MAXIMO_DE_TENTATIVAS + 1):
        cliente.sendto(dados, SERVIDOR)
        try:
            resposta, _ = cliente.recvfrom(1024)
            return json.loads(resposta.decode("utf-8")), tentativa
        except socket.timeout:
            print("  pedido", pedido["id"], "sem resposta na tentativa", tentativa)
    return None, MAXIMO_DE_TENTATIVAS


enviar("zerar")
reenvios = 0
sem_resposta = 0
ultima = None
for numero in range(1, DEPOSITOS + 1):
    resposta, tentativas = enviar("depositar", VALOR)
    reenvios += tentativas - 1
    if resposta is None:
        sem_resposta += 1
    else:
        ultima = resposta

print()
print("Depositos pedidos      :", DEPOSITOS, "de", VALOR)
print("Saldo esperado         :", DEPOSITOS * VALOR)
print("Saldo informado        :", ultima["saldo"] if ultima else "desconhecido")
print("Reenvios realizados    :", reenvios)
print("Pedidos sem resposta   :", sem_resposta)
```

### 14.8 `apiContas.py`, na máquina `banco`

```python
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

contas = {7: {"numero": 7, "titular": "Ana Souza", "saldo": 100}}
respostas_por_chave = {}


class Recurso(BaseHTTPRequestHandler):

    def responder(self, codigo, corpo=None):
        dados = b"" if corpo is None else json.dumps(corpo).encode("utf-8")
        self.send_response(codigo)
        if corpo is not None:
            self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(dados)))
        self.end_headers()
        self.wfile.write(dados)

    def ler_corpo(self):
        tamanho = int(self.headers.get("Content-Length", 0))
        try:
            return json.loads(self.rfile.read(tamanho) or b"{}")
        except json.JSONDecodeError:
            return None

    def caminho(self):
        partes = [p for p in self.path.split("/") if p]
        if not partes or partes[0] != "contas":
            return None, None, None
        numero = int(partes[1]) if len(partes) > 1 and partes[1].isdigit() else None
        sub = partes[2] if len(partes) > 2 else None
        return partes, numero, sub

    def do_GET(self):
        partes, numero, sub = self.caminho()
        if partes is None:
            self.responder(404, {"erro": "recurso inexistente"})
        elif numero is None:
            self.responder(200, list(contas.values()))
        elif numero in contas:
            self.responder(200, contas[numero])
        else:
            self.responder(404, {"erro": "conta inexistente"})

    def do_PUT(self):
        partes, numero, sub = self.caminho()
        corpo = self.ler_corpo()
        if numero is None or sub is not None:
            self.responder(405, {"erro": "PUT so se aplica a uma conta"})
        elif corpo is None or "titular" not in corpo or "saldo" not in corpo:
            self.responder(400, {"erro": "informe titular e saldo"})
        else:
            criada = numero not in contas
            contas[numero] = {"numero": numero, "titular": corpo["titular"], "saldo": corpo["saldo"]}
            self.responder(201 if criada else 200, contas[numero])

    def do_DELETE(self):
        partes, numero, sub = self.caminho()
        if numero in contas and sub is None:
            del contas[numero]
            self.responder(204)
        else:
            self.responder(404, {"erro": "conta inexistente"})

    def do_POST(self):
        partes, numero, sub = self.caminho()
        corpo = self.ler_corpo()
        if sub != "depositos":
            self.responder(405, {"erro": "POST so se aplica a /contas/N/depositos"})
            return
        if numero not in contas:
            self.responder(404, {"erro": "conta inexistente"})
            return
        if corpo is None or "valor" not in corpo:
            self.responder(400, {"erro": "informe o valor"})
            return
        chave = self.headers.get("Idempotency-Key")
        if chave and chave in respostas_por_chave:
            print("  chave", chave, "repetida, deposito nao executado de novo")
            self.responder(200, respostas_por_chave[chave])
            return
        contas[numero]["saldo"] += corpo["valor"]
        if chave:
            respostas_por_chave[chave] = dict(contas[numero])
        self.responder(201, contas[numero])


servidor = ThreadingHTTPServer(("0.0.0.0", 8080), Recurso)
print("API de contas aguardando na porta 8080...")
servidor.serve_forever()
```

### 14.9 `fila.py`, na máquina `banco`

```python
import json
import socket
import threading
from collections import deque

mensagens = deque()
sem_confirmacao = {}
proximo_id = 1
trava = threading.Condition()


def enviar(conexao, dados):
    conexao.sendall((json.dumps(dados) + "\n").encode("utf-8"))


def atender_produtor(pedido):
    global proximo_id
    with trava:
        mensagens.append({"id": proximo_id, "texto": pedido["texto"]})
        print(f"Recebida mensagem {proximo_id}, na fila: {len(mensagens)}")
        proximo_id += 1
        trava.notify()


def atender_consumidor(conexao, leitor, nome):
    while True:
        with trava:
            while not mensagens:
                trava.wait()
            mensagem = mensagens.popleft()
            sem_confirmacao[mensagem["id"]] = mensagem
        print(f"Entregue mensagem {mensagem['id']} ao consumidor {nome}")
        try:
            enviar(conexao, mensagem)
            linha = leitor.readline()
            if not linha:
                raise ConnectionError
            confirmacao = json.loads(linha)
            with trava:
                sem_confirmacao.pop(confirmacao["id"], None)
            print(f"Confirmada mensagem {mensagem['id']} pelo consumidor {nome}")
        except (ConnectionError, OSError, ValueError):
            with trava:
                sem_confirmacao.pop(mensagem["id"], None)
                mensagens.appendleft(mensagem)
                trava.notify()
            print(f"Consumidor {nome} caiu sem confirmar. Mensagem {mensagem['id']} volta para a fila")
            return


def atender(conexao, origem):
    leitor = conexao.makefile("r", encoding="utf-8")
    linha = leitor.readline()
    if linha:
        pedido = json.loads(linha)
        if pedido["tipo"] == "publicar":
            atender_produtor(pedido)
            while True:
                linha = leitor.readline()
                if not linha:
                    break
                atender_produtor(json.loads(linha))
        elif pedido["tipo"] == "consumir":
            nome = "%s:%d" % origem
            print(f"Consumidor {nome} conectado")
            atender_consumidor(conexao, leitor, nome)
    conexao.close()


servidor = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
servidor.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
servidor.bind(("0.0.0.0", 9300))
servidor.listen()
print("Fila de mensagens aguardando na porta 9300...")

while True:
    conexao, origem = servidor.accept()
    threading.Thread(target=atender, args=(conexao, origem), daemon=True).start()
```

### 14.10 `produtor.py`, na máquina `aplicacao`

```python
import json
import socket

FILA = ("192.168.56.101", 9300)
QUANTIDADE = 10

conexao = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
conexao.connect(FILA)
for numero in range(1, QUANTIDADE + 1):
    pedido = {"tipo": "publicar", "texto": "pedido de compra %d" % numero}
    conexao.sendall((json.dumps(pedido) + "\n").encode("utf-8"))
conexao.close()
print(QUANTIDADE, "mensagens publicadas. O produtor terminou.")
```

### 14.11 `consumidor.py`, na máquina `aplicacao` e `banco`

```python
import json
import socket
import time

FILA = ("192.168.56.101", 9300)
TEMPO_DE_PROCESSAMENTO = 2

conexao = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
conexao.connect(FILA)
conexao.sendall((json.dumps({"tipo": "consumir"}) + "\n").encode("utf-8"))
leitor = conexao.makefile("r", encoding="utf-8")
print("Consumidor aguardando mensagens...")

try:
    for linha in leitor:
        mensagem = json.loads(linha)
        print("Processando mensagem", mensagem["id"], ":", mensagem["texto"])
        time.sleep(TEMPO_DE_PROCESSAMENTO)
        confirmacao = {"tipo": "confirmar", "id": mensagem["id"]}
        conexao.sendall((json.dumps(confirmacao) + "\n").encode("utf-8"))
        print("  concluida e confirmada")
except KeyboardInterrupt:
    print("\nConsumidor interrompido antes de confirmar a mensagem em processamento.")
```

---

## Referência bibliográfica

COULOURIS, George et al. **Sistemas distribuídos: conceitos e projetos**. 5. ed. Porto Alegre:
Bookman, 2013. Capítulo 4, representação externa de dados e empacotamento. Capítulo 5, protocolos
de requisição e resposta e semânticas de invocação.

FIELDING, Roy Thomas. **Architectural Styles and the Design of Network-based Software
Architectures**. 2000. Tese (Doutorado em Ciência da Informação e Computação), University of
California, Irvine, 2000. Capítulo 5, o estilo REST.

KLEPPMANN, Martin. **Designing Data-Intensive Applications**. Sebastopol: O'Reilly, 2017.
Capítulo 4, codificação e evolução de formatos. Capítulo 11, fluxos de eventos e intermediários de
mensagens.

VAN STEEN, Maarten; TANENBAUM, Andrew S. **Distributed Systems**. 4. ed. 2023. Capítulo 4,
comunicação, incluindo a comunicação orientada a mensagens. Capítulo 8, comunicação confiável entre cliente e servidor na presença de falhas.
