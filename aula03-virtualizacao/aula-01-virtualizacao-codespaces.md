# Aula 01: aplicação web e banco de dados em contêineres

**Disciplina:** Tópicos Especiais IV (Computação Distribuída), Sistemas de Informação, UNIPAM
**Professor:** Rafael Marinho e Silva
**Ambiente:** GitHub Codespaces

---

## Objetivos de aprendizagem

Ao final desta aula o aluno deve ser capaz de:

1. Identificar dois contêineres em execução como dois nós de um sistema distribuído.
2. Explicar por que a comunicação entre esses nós ocorre por troca de mensagens.
3. Distinguir **nome** de **endereço** e descrever o mecanismo de descoberta de serviço.
4. Distinguir **imagem** de **contêiner** e justificar a necessidade de reconstrução.
5. Explicar a função de um **volume** na persistência do estado.
6. Executar e verificar uma aplicação de duas camadas orquestrada por Docker Compose.
7. Criar objetos em um banco PostgreSQL por dois clientes distintos.

---

## 1. Fundamentação

### 1.1 Processo, nó e contêiner

**Processo** é um programa em execução, com espaço de memória próprio. Dois processos não
acessam a memória um do outro, ainda que estejam no mesmo computador.

**Nó** é um processo que participa de um sistema distribuído.

**Contêiner** é um processo isolado pelo sistema operacional, com sistema de arquivos
próprio e endereço próprio na rede virtual criada pelo Docker. Do ponto de vista da rede,
dois contêineres equivalem a duas máquinas.

Da definição de processo decorre a propriedade que fundamenta toda a disciplina:

> Na ausência de memória compartilhada, toda troca de informação entre nós é uma mensagem
> que atravessa a rede.

O sistema desta aula é composto por dois nós:

| Nó | Papel | Tecnologia |
|---|---|---|
| `app` | recebe requisições HTTP e consulta o banco | Node.js com Express |
| `db` | armazena e devolve os dados | PostgreSQL |

Contêiner e máquina virtual não são a mesma coisa. A distinção entre os dois é objeto da
Unidade 5. Para os fins desta aula, interessa apenas o efeito: cada contêiner constitui um
nó independente.

### 1.2 Endereço, porta e endpoint

Um processo isolado não é endereçável. Para que uma mensagem seja entregue, a rede exige
três informações combinadas:

```
        protocolo   +   endereço IP   +   porta
           TCP          172.18.0.2       5432
       (como falar)   (qual máquina)  (qual processo)
```

O **endereço IP** identifica a máquina. A **porta** identifica qual processo, dentro
daquela máquina, deve receber a mensagem. O conjunto das três informações constitui o
**endpoint**.

### 1.3 Nome e endereço: descoberta de serviço

O endereço IP de um nó é volátil. Ele se altera quando o contêiner reinicia, quando a rede
é recriada e quando o sistema é implantado em outro ambiente. Um programa que contenha o
endereço escrito no código deixa de funcionar na primeira dessas alterações.

A solução adotada é a indireção por nome. O programa referencia um **nome estável**, e um
serviço de resolução traduz esse nome para o endereço vigente no instante em que a mensagem
é enviada:

```
   "db"  ──▶  [ serviço de nomes ]  ──▶  172.18.0.2  ──▶  mensagem entregue
 (estável)                               (volátil)
```

Esse mecanismo denomina-se **descoberta de serviço**. No Docker Compose, o serviço de nomes
é mantido pelo próprio Docker na rede do projeto, e o nome resolvido é o nome do serviço
declarado no arquivo de composição. O mesmo conceito reaparece em Kubernetes, na Unidade 5,
e em computação em nuvem, na Unidade 6.

### 1.4 Imagem e contêiner

**Imagem** é um artefato construído, imutável, que contém o sistema de arquivos e o
ambiente de execução da aplicação em determinado instante.

**Contêiner** é uma instância em execução de uma imagem.

A distinção tem consequência prática direta. Quando o arquivo de construção copia o código
para dentro da imagem, o contêiner passa a executar aquela cópia, e não os arquivos do
diretório de trabalho. Alterações posteriores no código-fonte não se refletem no contêiner
em execução enquanto a imagem não for reconstruída.

### 1.5 Volume e persistência do estado

**Volume** é uma área de armazenamento gerenciada pelo Docker, associada ao projeto e não à
imagem. Os dados gravados em um volume sobrevivem à remoção do contêiner que os produziu.

A separação entre o processo, que é descartável, e o estado, que é persistente, é um dos
princípios de projeto tratados na Unidade 5.

---

## 2. Descrição do sistema

### 2.1 Estrutura de arquivos

```
aula-01-virtualizacao/
├── docker-compose.yml
├── dockerfile
├── package.json
├── server.js
└── public/
    ├── cadastro.html
    ├── lista.html
    └── css/
        └── styles.css
```

| Arquivo | Função |
|---|---|
| `docker-compose.yml` | declara os dois serviços, a rede entre eles e o volume do banco |
| `dockerfile` | receita de construção da imagem da aplicação |
| `package.json` | declara as dependências `express` e `pg` |
| `server.js` | servidor HTTP, com as rotas de inserção e de listagem |
| `public/` | páginas entregues ao navegador |

### 2.2 O arquivo de composição

```yaml
services:
  db:
    image: postgres:17
    container_name: postgres_container
    environment:
      POSTGRES_USER: root
      POSTGRES_PASSWORD: root
      POSTGRES_DB: projeto
    ports:
      - "5432:5432"
    volumes:
      - db_data:/var/lib/postgresql/data

  app:
    build: .
    ports:
      - "3000:3000"
    depends_on:
      db:
        condition: service_healthy
```

Análise das declarações relevantes:

- **`services`**: cada entrada corresponde a um nó, conforme a seção 1.1.
- **`image: postgres:17`**: o banco não é construído, e sim obtido pronto de um repositório
  público de imagens.
- **`build: .`**: a aplicação é construída localmente, a partir do `dockerfile` do
  diretório corrente.
- **`ports: "5432:5432"` e `ports: "3000:3000"`**: publicam uma porta interna do contêiner
  na máquina hospedeira, que neste ambiente é o Codespace. A sintaxe é
  `porta_do_hospedeiro:porta_do_contêiner`.
- **`volumes: db_data:/var/lib/postgresql/data`**: associa o volume `db_data` ao diretório
  de dados do PostgreSQL, conforme a seção 1.5.
- **`depends_on` com `condition: service_healthy`**: a aplicação só é iniciada depois que o
  banco responder ao teste de saúde. A cláusula `depends_on` isolada garante apenas a ordem
  de partida, e não a disponibilidade do serviço.

### 2.3 A receita de construção

```dockerfile
FROM node:22
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

| Instrução | Efeito |
|---|---|
| `FROM node:22` | define a imagem base, que já contém o interpretador Node.js |
| `WORKDIR /usr/src/app` | define o diretório de trabalho dentro da imagem |
| `COPY package*.json ./` | copia apenas a declaração de dependências |
| `RUN npm install` | instala as dependências durante a construção |
| `COPY . .` | copia o restante do projeto para dentro da imagem |
| `EXPOSE 3000` | documenta a porta em que a aplicação escuta |
| `CMD ["node", "server.js"]` | comando executado quando o contêiner é iniciado |

A ordem das instruções não é arbitrária. A cópia do `package.json` precede a cópia do
código porque o Docker armazena em cache o resultado de cada instrução. Enquanto as
dependências não mudarem, a etapa `npm install` é reaproveitada.

### 2.4 A conexão da aplicação com o banco

O trecho de `server.js` que estabelece a conexão:

```js
const pool = new Pool({
  user: 'root',
  host: 'db',
  database: 'projeto',
  password: 'root',
  port: 5432,
});
```

O valor do campo `host` é `db`. Não se trata de um endereço IP, e sim do **nome** do
serviço declarado no arquivo de composição. A tradução desse nome para o endereço vigente é
feita pelo serviço de nomes do Docker no momento do envio, conforme a seção 1.3.

Observa-se ainda que usuário e senha estão escritos em texto claro, tanto no arquivo de
composição quanto no código da aplicação. Essa é uma prática inadequada em ambiente real, e
a alternativa correta, baseada em variáveis de ambiente e em gerenciadores de segredos, é
tratada na Unidade 6.

---

## 3. Roteiro de execução

### 3.1 Transferir os arquivos para o Codespace

Copiar o diretório `aula-01-virtualizacao` para o Codespace, arrastando a pasta para o
Explorer do VS Code ou utilizando a opção de upload.

Verificar a integridade da cópia:

```bash
cd aula-01-virtualizacao
ls -R
```

O parâmetro `-R` faz a listagem percorrer recursivamente os subdiretórios. A ausência de
`public/css/styles.css` na saída indica cópia incompleta, o que provoca falha nas etapas
seguintes.

### 3.2 Remover o volume de execuções anteriores

O material foi atualizado da versão 14 para a versão 17 do PostgreSQL. O servidor não abre
um diretório de dados gravado por versão anterior. Caso a prática já tenha sido executada
com a versão anterior, o volume precisa ser removido:

```bash
docker compose down -v
```

- `down` interrompe e remove os contêineres e a rede do projeto
- `-v` remove também os volumes declarados no arquivo de composição

A necessidade desse parâmetro confirma o exposto na seção 1.5: o volume sobreviveu à
remoção dos contêineres e só é apagado por comando explícito.

### 3.3 Construir e iniciar os contêineres

```bash
docker compose up -d --build
```

- `up` cria a rede, cria os contêineres e inicia os serviços
- `--build` reconstrói a imagem da aplicação antes de iniciar
- `-d` executa em segundo plano e devolve o controle do terminal

A primeira execução transfere as imagens `postgres:17` e `node:22` do repositório público.
Essa transferência ocorre uma única vez, pois as imagens ficam armazenadas localmente.

### 3.4 Verificar o estado dos serviços

```bash
docker compose ps
```

A saída deve apresentar dois contêineres no estado `running`. O estado `exited` no serviço
`app` indica encerramento por erro, cuja causa é registrada no log:

```bash
docker compose logs app
```

O parâmetro `-f` mantém o terminal acompanhando as linhas produzidas a partir daquele
instante:

```bash
docker compose logs -f app
```

O acompanhamento é encerrado com `Ctrl+C`, o que não interrompe o contêiner.

### 3.5 Acessar a aplicação

No VS Code, abrir o painel **PORTS**, adjacente ao TERMINAL. A porta 3000 aparece
associada a um endereço terminado em `app.github.dev`, que dá acesso à aplicação pelo
navegador.

A tela de cadastro é exibida sem formatação. A causa é analisada na seção 4.

---

## 4. Correção da referência à folha de estilo

O material contém um defeito deliberado na referência ao arquivo de estilo. Sua correção é
utilizada para demonstrar a distinção entre imagem e contêiner apresentada na seção 1.4.

### 4.1 Identificar o defeito

O cabeçalho de `public/cadastro.html` contém:

```html
<link rel="stylesheet" href="css/style.css">
```

O arquivo existente no diretório é `public/css/styles.css`. A referência omite a letra `s`.

Antes da correção, abrir as ferramentas de desenvolvedor do navegador com `F12`,
selecionar a aba **Network** e recarregar a página. A listagem apresenta:

```
cadastro.html    200
style.css        404
```

A leitura desse resultado é conceitualmente relevante. O carregamento de uma página não
corresponde a uma única mensagem, e sim a um conjunto de mensagens independentes. O
navegador solicitou o documento HTML, recebeu-o, interpretou seu conteúdo, identificou a
dependência de um arquivo de estilo e emitiu uma **segunda requisição**. A primeira obteve
resposta bem-sucedida, indicada pelo código 200. A segunda obteve o código 404.

O código 404 indica que o servidor recebeu a requisição, interpretou-a e respondeu que o
recurso não existe. Há resposta. A distinção entre **responder negativamente** e **não
responder** é determinante em sistemas distribuídos e constitui o ponto de partida da
Unidade 2, quando se discute a impossibilidade de distinguir um nó lento de um nó
indisponível.

### 4.2 Corrigir os dois arquivos

O mesmo defeito ocorre em `public/cadastro.html` e em `public/lista.html`. Em ambos, a
linha correta é:

```html
<link rel="stylesheet" href="css/styles.css">
```

Após salvar os arquivos e recarregar a página, a formatação **não** é aplicada. Esse
resultado é esperado.

### 4.3 Reconstruir a imagem

A instrução `COPY . .` do `dockerfile` copiou os arquivos para dentro da imagem no instante
da construção. O contêiner em execução serve aquela cópia, e não o diretório de trabalho
onde a edição foi feita.

> A imagem é um registro do código no instante da construção. O contêiner executa esse
> registro. A ausência de efeito ao editar o arquivo de origem não constitui defeito, e sim
> a consequência direta da definição de imagem.

Para que a correção passe a vigorar, a imagem precisa ser reconstruída:

```bash
docker compose up -d --build
```

Recarregar a página com `Ctrl+Shift+F5`, que força a nova obtenção de todos os recursos em
vez de reaproveitar o cache do navegador. Um recarregamento comum pode manter o resultado
404 armazenado.

A página passa então a ser exibida com formatação.

---

## 5. Criação da tabela no banco

A aplicação está em execução, mas o envio do formulário retorna `Erro ao cadastrar pessoa`.
O servidor de banco está ativo e o banco `projeto` existe, porém a tabela de destino dos
registros ainda não foi criada.

A tabela é criada por dois clientes distintos. A execução das duas formas é parte do
objetivo da aula, conforme a análise da seção 5.3.

### 5.1 Pelo cliente gráfico do VS Code

A extensão indicada é publicada na loja de extensões sob o nome **MySQL**, embora atenda a
diversos sistemas gerenciadores, entre eles o PostgreSQL.

A denominação merece observação conceitual. O cliente não é o banco. O que determina a
compatibilidade é o protocolo que o cliente implementa e o endereço para o qual ele se
dirige, não o nome do programa.

Criar uma conexão do tipo PostgreSQL com os seguintes parâmetros:

| Campo | Valor |
|---|---|
| Host | `localhost` |
| Porta | `5432` |
| Usuário | `root` |
| Senha | `root` |
| Banco | `projeto` |

Estabelecida a conexão, executar em uma janela de consulta:

```sql
CREATE TABLE pessoas (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    telefone VARCHAR(20)
);
```

Declarações da tabela:

| Coluna | Declaração | Efeito |
|---|---|---|
| `id` | `SERIAL PRIMARY KEY` | inteiro gerado e incrementado pelo próprio banco, que identifica a linha de forma única |
| `nome` | `VARCHAR(100) NOT NULL` | até 100 caracteres, obrigatório |
| `email` | `VARCHAR(100) UNIQUE NOT NULL` | até 100 caracteres, obrigatório, e recusado se já existir em outra linha |
| `telefone` | `VARCHAR(20)` | até 20 caracteres, opcional |

### 5.2 Pelo psql, no interior do contêiner

O `psql` é o cliente de linha de comando do PostgreSQL e integra a imagem oficial do banco,
o que dispensa qualquer instalação adicional.

```bash
docker exec -it postgres_container psql -U root -d projeto
```

| Elemento | Função |
|---|---|
| `docker exec` | executa um programa dentro de um contêiner já em execução |
| `-it` | associa o terminal ao programa, permitindo a interação |
| `postgres_container` | nome do contêiner, definido em `container_name` |
| `psql -U root -d projeto` | programa executado, com usuário `root` e banco `projeto` |

O prompt passa a `projeto=#`. Para listar as tabelas do banco:

```sql
\dt
```

A tabela `pessoas`, criada pelo cliente gráfico, é listada. Caso a extensão não tenha sido
utilizada, executar aqui o mesmo comando `CREATE TABLE` da seção 5.1. O resultado é
idêntico.

Para consultar o conteúdo e encerrar a sessão:

```sql
SELECT * FROM pessoas;
\q
```

### 5.3 Análise: três clientes, um único estado

Três programas distintos acessam o mesmo processo de banco de dados, cada um por um caminho
diferente:

| Cliente | Endereço utilizado | Caminho percorrido |
|---|---|---|
| aplicação Node.js | `db:5432` | rede interna do Docker, com resolução de nome |
| `psql` via `docker exec` | interface local do contêiner | não trafega pela rede externa ao contêiner |
| cliente gráfico do VS Code | `localhost:5432` | porta publicada pelo arquivo de composição |

Três endereços, três caminhos, um único processo e um único conjunto de dados. A tabela
criada por um cliente é visível aos demais imediatamente, sem que qualquer um deles tenha
conhecimento da existência dos outros.

Deriva-se daí a formulação que orienta o restante da disciplina:

> O estado é mantido por um nó. As consultas podem originar-se de qualquer nó, desde que
> conheçam o endereço e implementem o protocolo correspondente.

---

## 6. Operação da aplicação

### 6.1 Inserção de um registro

Preencher o formulário com nome, endereço de correio eletrônico e telefone, e submetê-lo. O
navegador é redirecionado para a página de listagem, onde o registro é exibido.

A rota responsável pela inserção, em `server.js`:

```js
app.post('/pessoas', async (req, res) => {
  const { nome, email, telefone } = req.body;
  await pool.query(
    'INSERT INTO pessoas (nome, email, telefone) VALUES ($1, $2, $3)',
    [nome, email, telefone]
  );
  res.redirect('/lista.html');
});
```

A operação corresponde a uma sequência de mensagens, e nenhuma delas é uma chamada de
função local:

1. o navegador submete o formulário à aplicação, por HTTP sobre TCP
2. a aplicação submete um comando SQL ao banco, por TCP, endereçando o nome `db`
3. a aplicação responde ao navegador com um redirecionamento

A página de listagem origina uma quarta mensagem no momento em que é carregada. O trecho
correspondente, ao final de `lista.html`:

```js
const response = await fetch('/pessoas');
const pessoas = await response.json();
```

O documento HTML é entregue sem dados. A obtenção dos registros é uma requisição
independente, emitida pelo navegador após a interpretação da página. Essa separação entre
a entrega do documento e a entrega dos dados explica o pequeno intervalo entre a exibição
da página e o preenchimento da tabela.

### 6.2 Violação da restrição de unicidade

Repetindo a inserção com o **mesmo endereço de correio eletrônico**, a aplicação retorna
`Erro ao cadastrar pessoa`.

A recusa não é originada pela aplicação. O código de `server.js` não contém qualquer
verificação de duplicidade. A recusa é originada pelo banco, em decorrência da restrição
`UNIQUE` declarada na criação da tabela, e é propagada até o navegador pelo tratamento de
exceção da rota.

> A regra de integridade reside no componente que mantém o estado, e não no componente que
> emite a solicitação.

Esse comportamento é o mesmo que se manifesta quando duas solicitações concorrentes
disputam um recurso único. O componente que mantém o estado recusa a gravação que conflita
com o conteúdo já registrado. O tratamento formal desse problema, sob a forma de exclusão
mútua e de consistência, é objeto das Unidades 7 e 8.

---

## 7. Referência de comandos

| Comando | Função |
|---|---|
| `docker compose up -d` | inicia os contêineres em segundo plano |
| `docker compose up -d --build` | reconstrói as imagens antes de iniciar |
| `docker compose ps` | lista os contêineres do projeto e seus estados |
| `docker compose logs app` | exibe a saída da aplicação |
| `docker compose logs -f db` | acompanha a saída do banco continuamente |
| `docker compose stop` | interrompe os contêineres sem removê-los |
| `docker compose down` | interrompe e remove contêineres e rede, preservando volumes |
| `docker compose down -v` | remove também os volumes, e portanto os dados |
| `docker exec -it postgres_container psql -U root -d projeto` | abre o cliente do banco no interior do contêiner |
| `docker ps` | lista os contêineres em execução na máquina |
| `docker images` | lista as imagens disponíveis localmente |

---

## 8. Síntese

1. Dois contêineres constituem dois nós. Não compartilham memória e comunicam-se por
   mensagem, ainda que executem na mesma máquina.
2. A aplicação localiza o banco por um **nome**, e não por um endereço, porque o endereço é
   volátil e o nome é estável. O mecanismo denomina-se descoberta de serviço.
3. A **imagem** é um registro do código no instante da construção. O contêiner executa esse
   registro, o que torna a reconstrução necessária após qualquer alteração no código.
4. O carregamento de uma página corresponde a diversas mensagens independentes, cada uma
   sujeita a falhar isoladamente.
5. Um mesmo servidor de banco atende clientes distintos por caminhos distintos, sobre um
   único conjunto de dados.
6. A regra de integridade reside no componente que mantém o estado.
7. O **volume** desacopla a persistência do ciclo de vida do contêiner.

### Limite deste experimento

Todos os componentes executaram na mesma máquina, sobre uma rede virtual. A latência foi
desprezível e nenhuma mensagem foi perdida. As propriedades que caracterizam uma rede real,
o atraso variável e a perda de mensagens, não se manifestaram e não puderam ser observadas.
O tratamento dessas propriedades inicia-se na aula 02, quando os nós passam a residir em
máquinas distintas.

### Referência bibliográfica

COULOURIS, G. et al. **Sistemas Distribuídos: conceitos e projeto**. 5. ed. Porto Alegre:
Bookman, 2013. Capítulo 1, seções 1.1 a 1.4, e Capítulo 4, seção 4.2.
